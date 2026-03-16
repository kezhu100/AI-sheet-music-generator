from __future__ import annotations

import audioop
import json
import math
import struct
import subprocess
import sys
import wave
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Any, Dict, Iterable, List, Optional, Sequence

from app.core.config import Settings
from app.models.schemas import NoteEvent
from app.pipeline.interfaces import DrumTranscriptionProvider, SourceStem, TranscriptionResult

DRUM_TRANSCRIPTION_PROVIDER_HEURISTIC = "heuristic"
DRUM_TRANSCRIPTION_PROVIDER_ML = "ml"
DRUM_TRANSCRIPTION_PROVIDER_MADMOM = "madmom"

DRUM_MIDI_BY_LABEL = {
    "kick": 36,
    "snare": 38,
    "hi-hat": 42,
}


class UnsupportedDrumStemError(Exception):
    pass


class DrumTranscriptionProviderError(RuntimeError):
    pass


class HeuristicWavDrumTranscriptionProvider(DrumTranscriptionProvider):
    provider_name = "heuristic-wav-drum-provider"

    def transcribe(self, stem: SourceStem) -> TranscriptionResult:
        warnings = [
            "Drum transcription is now a real heuristic MVP provider that consumes the persisted drum stem and currently supports only uncompressed PCM .wav stems.",
            "The heuristic drum provider is onset-focused and works best for simple percussive material; dense drum kits and cymbal detail may be simplified or missed.",
        ]

        if stem.file_path.suffix.lower() != ".wav":
            warnings.append(
                f"Skipping real drum transcription for stem '{stem.stem_name}' because only PCM .wav stems are supported in the heuristic drum provider."
            )
            return TranscriptionResult(
                provider_name=self.provider_name,
                instrument="drums",
                source_stem=stem.stem_name,
                notes=[],
                warnings=warnings,
            )

        try:
            samples, sample_rate = self._load_wav_samples(stem.file_path)
        except UnsupportedDrumStemError as exc:
            warnings.append(str(exc))
            return TranscriptionResult(
                provider_name=self.provider_name,
                instrument="drums",
                source_stem=stem.stem_name,
                notes=[],
                warnings=warnings,
            )

        hits = self._detect_hits(samples, sample_rate)
        notes = self._build_note_events(stem, samples, sample_rate, hits)

        if not notes:
            warnings.append(
                "The heuristic drum provider did not detect reliable percussive onsets in this stem. Clear isolated hits and simple rhythms work best in the current fallback path."
            )

        return TranscriptionResult(
            provider_name=self.provider_name,
            instrument="drums",
            source_stem=stem.stem_name,
            notes=notes,
            warnings=warnings,
        )

    def _build_note_events(
        self,
        stem: SourceStem,
        samples: list[float],
        sample_rate: int,
        hits: list[tuple[int, int, float]],
    ) -> list[NoteEvent]:
        notes: list[NoteEvent] = []

        for index, (start_sample, end_sample, peak_level) in enumerate(hits, start=1):
            drum_label, midi_note, confidence = self._classify_hit(samples, sample_rate, start_sample, end_sample, peak_level)
            onset_sec = round(start_sample / sample_rate, 3)
            offset_sec = round(end_sample / sample_rate, 3)
            bar, beat = self._estimate_bar_beat(onset_sec)

            notes.append(
                NoteEvent(
                    id=f"{stem.stem_name}-drums-{index}",
                    instrument="drums",
                    drumLabel=drum_label,
                    midiNote=midi_note,
                    onsetSec=onset_sec,
                    offsetSec=offset_sec,
                    velocity=self._estimate_velocity(peak_level),
                    confidence=confidence,
                    channel=9,
                    bar=bar,
                    beat=beat,
                    sourceStem=stem.stem_name,
                )
            )

        return notes

    def _load_wav_samples(self, file_path: Path) -> tuple[list[float], int]:
        try:
            with wave.open(str(file_path), "rb") as wav_file:
                if wav_file.getcomptype() != "NONE":
                    raise UnsupportedDrumStemError("Real drum transcription currently supports only uncompressed PCM .wav stems.")

                sample_width = wav_file.getsampwidth()
                if sample_width not in {1, 2, 4}:
                    raise UnsupportedDrumStemError(
                        "Real drum transcription currently supports PCM .wav stems with 8-bit, 16-bit, or 32-bit sample widths."
                    )

                frame_rate = wav_file.getframerate()
                frame_count = wav_file.getnframes()
                channel_count = wav_file.getnchannels()
                raw_frames = wav_file.readframes(frame_count)
        except wave.Error as exc:
            raise UnsupportedDrumStemError(f"Failed to read PCM .wav stem for drum transcription: {exc}") from exc

        if channel_count > 1:
            raw_frames = audioop.tomono(raw_frames, sample_width, 0.5, 0.5)

        if sample_width == 1:
            unpacked = raw_frames
            return [((sample - 128) / 128.0) for sample in unpacked], frame_rate

        if sample_width == 2:
            sample_count = len(raw_frames) // 2
            unpacked = struct.unpack(f"<{sample_count}h", raw_frames)
            return [sample / 32768.0 for sample in unpacked], frame_rate

        sample_count = len(raw_frames) // 4
        unpacked = struct.unpack(f"<{sample_count}i", raw_frames)
        return [sample / 2147483648.0 for sample in unpacked], frame_rate

    def _detect_hits(self, samples: list[float], sample_rate: int) -> list[tuple[int, int, float]]:
        if not samples:
            return []

        window_size = max(128, int(sample_rate * 0.01))
        hop_size = max(64, int(sample_rate * 0.005))
        refractory_samples = int(sample_rate * 0.08)
        release_samples = int(sample_rate * 0.12)

        frame_levels: list[tuple[int, float]] = []
        max_level = 0.0

        for start in range(0, len(samples), hop_size):
            end = min(len(samples), start + window_size)
            if end <= start:
                continue

            level = sum(abs(sample) for sample in samples[start:end]) / (end - start)
            frame_levels.append((start, level))
            max_level = max(max_level, level)

        if max_level <= 0.0:
            return []

        start_threshold = max(0.02, max_level * 0.33)
        release_threshold = max(0.008, start_threshold * 0.4)
        hits: list[tuple[int, int, float]] = []
        last_hit_sample = -refractory_samples
        frame_index = 0

        while frame_index < len(frame_levels):
            frame_start, level = frame_levels[frame_index]
            if level < start_threshold or frame_start - last_hit_sample < refractory_samples:
                frame_index += 1
                continue

            region_peak = level
            region_end = frame_start + window_size
            cursor = frame_index + 1

            while cursor < len(frame_levels):
                next_start, next_level = frame_levels[cursor]
                region_peak = max(region_peak, next_level)
                region_end = next_start + window_size
                if next_level < release_threshold and next_start - frame_start >= release_samples:
                    break
                cursor += 1

            hits.append((frame_start, min(len(samples), region_end), region_peak))
            last_hit_sample = frame_start
            frame_index = cursor + 1

        return hits

    def _classify_hit(
        self,
        samples: list[float],
        sample_rate: int,
        start_sample: int,
        end_sample: int,
        peak_level: float,
    ) -> tuple[str, int, float]:
        analysis_end = min(len(samples), start_sample + max(int(sample_rate * 0.09), end_sample - start_sample))
        analysis = samples[start_sample:analysis_end]
        if len(analysis) < 8:
            return "snare", 38, 0.45

        zero_crossings = 0
        low_energy = 0.0
        high_energy = 0.0
        total_energy = 0.0
        low_pass_value = 0.0

        for index, sample in enumerate(analysis):
            total_energy += sample * sample
            if index > 0 and ((analysis[index - 1] <= 0 < sample) or (analysis[index - 1] >= 0 > sample)):
                zero_crossings += 1

            low_pass_value = (low_pass_value * 0.94) + (sample * 0.06)
            high_pass_value = sample - low_pass_value
            low_energy += low_pass_value * low_pass_value
            high_energy += high_pass_value * high_pass_value

        duration_sec = max(0.01, (end_sample - start_sample) / sample_rate)
        zcr = zero_crossings / len(analysis)
        low_ratio = 0.0 if total_energy <= 1e-9 else min(1.0, low_energy / total_energy)
        high_ratio = 0.0 if total_energy <= 1e-9 else min(1.0, high_energy / total_energy)

        if low_ratio >= 0.72 and high_ratio <= 0.45 and zcr <= 0.12:
            confidence = round(min(0.95, 0.58 + peak_level * 1.4 + low_ratio * 0.15), 2)
            return "kick", 36, confidence

        if high_ratio >= 0.75 or (high_ratio >= 0.55 and (zcr >= 0.18 or duration_sec <= 0.07)):
            confidence = round(min(0.92, 0.48 + peak_level * 1.0 + high_ratio * 0.2), 2)
            return "hi-hat", 42, confidence

        confidence = round(min(0.9, 0.46 + peak_level * 1.1 + min(0.16, high_ratio * 0.18)), 2)
        return "snare", 38, confidence

    def _estimate_velocity(self, peak_level: float) -> int:
        scaled = int(peak_level * 240)
        return max(36, min(127, scaled))

    def _estimate_bar_beat(self, onset_sec: float, bpm: int = 120) -> tuple[int, float]:
        beat_duration = 60.0 / bpm
        beat_index = int(onset_sec / beat_duration)
        bar = (beat_index // 4) + 1
        beat = round((onset_sec / beat_duration) % 4 + 1, 2)
        return bar, beat


class MadmomDrumTranscriptionProvider(DrumTranscriptionProvider):
    provider_name = "madmom-drum-provider"

    def __init__(
        self,
        python_executable: Optional[str] = None,
        minimum_confidence: float = 0.35,
    ) -> None:
        self._python_executable = python_executable or sys.executable
        self._minimum_confidence = minimum_confidence
        self._runner_path = Path(__file__).with_name("madmom_drum_runner.py")
        self._fallback_classifier = HeuristicWavDrumTranscriptionProvider()

    def transcribe(self, stem: SourceStem) -> TranscriptionResult:
        warnings = [
            "Drum transcription attempted the stronger madmom-backed onset provider behind the existing provider contract.",
            "madmom runtime availability depends on the configured Python environment and optional ML dependencies.",
        ]

        try:
            samples, sample_rate = self._fallback_classifier._load_wav_samples(stem.file_path)
        except UnsupportedDrumStemError as exc:
            warnings.append(str(exc))
            return TranscriptionResult(
                provider_name=self.provider_name,
                instrument="drums",
                source_stem=stem.stem_name,
                notes=[],
                warnings=warnings,
            )

        raw_onsets = self._run_madmom(stem.file_path)
        hits = self._build_hits_from_onsets(samples, sample_rate, raw_onsets)
        notes = self._build_note_events(stem, samples, sample_rate, hits)

        if not notes:
            warnings.append(
                "The madmom-backed drum provider did not return any normalized drum hits above the configured confidence threshold for this stem."
            )

        return TranscriptionResult(
            provider_name=self.provider_name,
            instrument="drums",
            source_stem=stem.stem_name,
            notes=notes,
            warnings=warnings,
        )

    def _run_madmom(self, audio_path: Path) -> List[Any]:
        with NamedTemporaryFile(suffix=".json", delete=False) as temp_file:
            output_path = Path(temp_file.name)

        command = [
            self._python_executable,
            str(self._runner_path),
            "--input",
            str(audio_path),
            "--output",
            str(output_path),
        ]

        try:
            completed = subprocess.run(
                command,
                check=False,
                capture_output=True,
                text=True,
            )
        except FileNotFoundError as exc:
            raise DrumTranscriptionProviderError(
                f"madmom Python executable was not found at '{self._python_executable}'."
            ) from exc

        try:
            if completed.returncode != 0:
                detail = completed.stderr.strip() or completed.stdout.strip() or "unknown error"
                raise DrumTranscriptionProviderError(
                    f"madmom drum transcription failed with exit code {completed.returncode}: {detail}"
                )

            payload = json.loads(output_path.read_text(encoding="utf-8"))
            if not isinstance(payload, dict) or not isinstance(payload.get("onsets"), list):
                raise DrumTranscriptionProviderError("madmom drum runner returned an invalid onset payload.")
            return list(payload["onsets"])
        finally:
            output_path.unlink(missing_ok=True)

    def _build_hits_from_onsets(
        self,
        samples: list[float],
        sample_rate: int,
        raw_onsets: Iterable[Any],
    ) -> list[tuple[int, int, float]]:
        normalized_onsets: list[tuple[float, float]] = []
        for raw_onset in raw_onsets:
            coerced = self._coerce_onset(raw_onset)
            if coerced is not None:
                normalized_onsets.append(coerced)

        normalized_onsets.sort(key=lambda item: item[0])
        hits: list[tuple[int, int, float]] = []

        for index, (onset_sec, onset_confidence) in enumerate(normalized_onsets):
            start_sample = max(0, int(round(onset_sec * sample_rate)))
            next_onset_sec = normalized_onsets[index + 1][0] if index + 1 < len(normalized_onsets) else None
            max_hit_sec = 0.14
            min_hit_sec = 0.05
            if next_onset_sec is None:
                duration_sec = max_hit_sec
            else:
                duration_sec = min(max_hit_sec, max(min_hit_sec, next_onset_sec - onset_sec - 0.01))

            end_sample = min(len(samples), start_sample + int(round(duration_sec * sample_rate)))
            if end_sample - start_sample < max(1, int(round(0.05 * sample_rate))):
                continue

            segment = samples[start_sample:end_sample]
            peak_level = max((abs(sample) for sample in segment), default=0.0)
            if peak_level <= 0.0:
                continue

            peak_level = min(1.0, max(peak_level, onset_confidence))
            hits.append((start_sample, end_sample, peak_level))

        return hits

    def _build_note_events(
        self,
        stem: SourceStem,
        samples: list[float],
        sample_rate: int,
        hits: list[tuple[int, int, float]],
    ) -> list[NoteEvent]:
        notes: list[NoteEvent] = []

        for index, (start_sample, end_sample, peak_level) in enumerate(hits, start=1):
            drum_label, midi_note, confidence = self._fallback_classifier._classify_hit(
                samples, sample_rate, start_sample, end_sample, peak_level
            )
            if confidence < self._minimum_confidence:
                continue

            onset_sec = round(start_sample / sample_rate, 3)
            offset_sec = round(end_sample / sample_rate, 3)
            bar, beat = self._fallback_classifier._estimate_bar_beat(onset_sec)

            notes.append(
                NoteEvent(
                    id=f"{stem.stem_name}-drums-{index}",
                    instrument="drums",
                    drumLabel=drum_label,
                    midiNote=midi_note,
                    onsetSec=onset_sec,
                    offsetSec=offset_sec,
                    velocity=self._fallback_classifier._estimate_velocity(peak_level),
                    confidence=round(confidence, 2),
                    channel=9,
                    bar=bar,
                    beat=beat,
                    sourceStem=stem.stem_name,
                )
            )

        notes.sort(key=lambda note: (note.onset_sec, note.midi_note or 0, note.id))
        return notes

    def _coerce_onset(self, raw_onset: Any) -> Optional[tuple[float, float]]:
        onset_sec: Optional[float] = None
        confidence: Optional[float] = None

        if isinstance(raw_onset, dict):
            onset_sec = _coerce_float(raw_onset.get("onsetSec", raw_onset.get("time", raw_onset.get("onset"))))
            confidence = _coerce_float(raw_onset.get("confidence", raw_onset.get("strength")))
        elif isinstance(raw_onset, Sequence) and not isinstance(raw_onset, (str, bytes, bytearray)):
            if len(raw_onset) >= 1:
                onset_sec = _coerce_float(raw_onset[0])
            if len(raw_onset) >= 2:
                confidence = _coerce_float(raw_onset[1])
        else:
            onset_sec = _coerce_float(raw_onset)

        if onset_sec is None or onset_sec < 0:
            return None

        safe_confidence = 0.8 if confidence is None else max(0.0, min(1.0, confidence))
        return onset_sec, safe_confidence


class FallbackDrumTranscriptionProvider(DrumTranscriptionProvider):
    def __init__(self, primary: DrumTranscriptionProvider, fallback: DrumTranscriptionProvider) -> None:
        self._primary = primary
        self._fallback = fallback
        self.provider_name = primary.provider_name

    def transcribe(self, stem: SourceStem) -> TranscriptionResult:
        try:
            return self._primary.transcribe(stem)
        except DrumTranscriptionProviderError as exc:
            fallback_result = self._fallback.transcribe(stem)
            warnings = [
                f"Configured drum transcription provider '{self._primary.provider_name}' was unavailable, so the pipeline fell back to '{fallback_result.provider_name}': {exc}"
            ]
            warnings.extend(fallback_result.warnings)
            return TranscriptionResult(
                provider_name=fallback_result.provider_name,
                instrument=fallback_result.instrument,
                source_stem=fallback_result.source_stem,
                notes=fallback_result.notes,
                warnings=_dedupe_warnings(warnings),
            )


def build_drum_transcription_provider(settings: Settings) -> DrumTranscriptionProvider:
    provider_id = settings.drum_transcription_provider
    fallback_id = settings.drum_transcription_fallback_provider

    primary = _create_provider(provider_id, settings)
    if fallback_id and fallback_id != provider_id:
        fallback = _create_provider(fallback_id, settings)
        return FallbackDrumTranscriptionProvider(primary=primary, fallback=fallback)

    return primary


def _create_provider(provider_id: str, settings: Settings) -> DrumTranscriptionProvider:
    if provider_id == DRUM_TRANSCRIPTION_PROVIDER_HEURISTIC:
        return HeuristicWavDrumTranscriptionProvider()
    if provider_id in {DRUM_TRANSCRIPTION_PROVIDER_ML, DRUM_TRANSCRIPTION_PROVIDER_MADMOM}:
        return MadmomDrumTranscriptionProvider(
            python_executable=settings.drum_transcription_ml_python,
            minimum_confidence=settings.drum_transcription_ml_min_confidence,
        )

    raise ValueError(f"Unsupported drum transcription provider '{provider_id}'.")


def _coerce_float(value: Any) -> Optional[float]:
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _dedupe_warnings(warnings: List[str]) -> List[str]:
    deduped: List[str] = []
    for warning in warnings:
        if warning not in deduped:
            deduped.append(warning)
    return deduped
