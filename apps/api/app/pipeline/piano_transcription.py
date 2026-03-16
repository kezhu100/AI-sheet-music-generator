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
from app.pipeline.interfaces import PianoTranscriptionProvider, SourceStem, TranscriptionResult

PIANO_TRANSCRIPTION_PROVIDER_HEURISTIC = "heuristic"
PIANO_TRANSCRIPTION_PROVIDER_ML = "ml"
PIANO_TRANSCRIPTION_PROVIDER_BASIC_PITCH = "basic-pitch"


class UnsupportedPianoStemError(Exception):
    pass


class PianoTranscriptionProviderError(RuntimeError):
    pass


class HeuristicWavPianoTranscriptionProvider(PianoTranscriptionProvider):
    provider_name = "heuristic-wav-piano-provider"

    def transcribe(self, stem: SourceStem) -> TranscriptionResult:
        warnings = [
            "Piano transcription is a real heuristic MVP provider that currently supports only uncompressed PCM .wav stems.",
            "The heuristic piano provider is optimized for simple monophonic or lightly overlapping piano phrases and may simplify or miss dense polyphonic passages.",
        ]

        if stem.file_path.suffix.lower() != ".wav":
            warnings.append(
                f"Skipping real piano transcription for stem '{stem.stem_name}' because only PCM .wav stems are supported in the heuristic piano provider."
            )
            return TranscriptionResult(
                provider_name=self.provider_name,
                instrument="piano",
                source_stem=stem.stem_name,
                notes=[],
                warnings=warnings,
            )

        try:
            samples, sample_rate = self._load_wav_samples(stem.file_path)
        except UnsupportedPianoStemError as exc:
            warnings.append(str(exc))
            return TranscriptionResult(
                provider_name=self.provider_name,
                instrument="piano",
                source_stem=stem.stem_name,
                notes=[],
                warnings=warnings,
            )

        note_regions = self._detect_note_regions(samples, sample_rate)
        notes: list[NoteEvent] = []

        for index, (start_sample, end_sample, peak_level) in enumerate(note_regions, start=1):
            frequency, confidence = self._estimate_pitch(samples, sample_rate, start_sample, end_sample)
            if frequency is None:
                continue

            pitch = self._frequency_to_midi(frequency)
            if pitch is None:
                continue

            onset_sec = start_sample / sample_rate
            offset_sec = end_sample / sample_rate
            velocity = self._estimate_velocity(peak_level)

            notes.append(
                NoteEvent(
                    id=f"{stem.stem_name}-piano-{index}",
                    instrument="piano",
                    pitch=pitch,
                    onsetSec=round(onset_sec, 3),
                    offsetSec=round(offset_sec, 3),
                    velocity=velocity,
                    confidence=round(confidence, 2),
                    channel=0,
                    sourceStem=stem.stem_name,
                )
            )

        if not notes:
            warnings.append(
                "The heuristic piano provider did not detect reliable note regions in this stem. Simple isolated piano notes work best in the current fallback path."
            )

        return TranscriptionResult(
            provider_name=self.provider_name,
            instrument="piano",
            source_stem=stem.stem_name,
            notes=notes,
            warnings=warnings,
        )

    def _load_wav_samples(self, file_path: Path) -> tuple[list[float], int]:
        try:
            with wave.open(str(file_path), "rb") as wav_file:
                if wav_file.getcomptype() != "NONE":
                    raise UnsupportedPianoStemError("Real piano transcription currently supports only uncompressed PCM .wav stems.")

                sample_width = wav_file.getsampwidth()
                if sample_width not in {1, 2, 4}:
                    raise UnsupportedPianoStemError(
                        "Real piano transcription currently supports PCM .wav stems with 8-bit, 16-bit, or 32-bit sample widths."
                    )

                frame_rate = wav_file.getframerate()
                frame_count = wav_file.getnframes()
                channel_count = wav_file.getnchannels()
                raw_frames = wav_file.readframes(frame_count)
        except wave.Error as exc:
            raise UnsupportedPianoStemError(f"Failed to read PCM .wav stem for piano transcription: {exc}") from exc

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

    def _detect_note_regions(self, samples: list[float], sample_rate: int) -> list[tuple[int, int, float]]:
        if not samples:
            return []

        window_size = max(256, int(sample_rate * 0.02))
        hop_size = max(128, int(sample_rate * 0.01))
        min_note_samples = int(sample_rate * 0.12)
        max_silence_samples = int(sample_rate * 0.08)

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

        start_threshold = max(0.015, max_level * 0.32)
        sustain_threshold = max(0.008, start_threshold * 0.45)

        regions: list[tuple[int, int, float]] = []
        active_start: Optional[int] = None
        last_active_end = 0
        region_peak = 0.0

        for frame_start, level in frame_levels:
            frame_end = min(len(samples), frame_start + window_size)

            if active_start is None:
                if level >= start_threshold:
                    active_start = max(0, frame_start - hop_size)
                    last_active_end = frame_end
                    region_peak = level
                continue

            region_peak = max(region_peak, level)
            if level >= sustain_threshold:
                last_active_end = frame_end
                continue

            if frame_start - last_active_end >= max_silence_samples:
                region_end = min(len(samples), last_active_end + hop_size)
                if region_end - active_start >= min_note_samples:
                    regions.append((active_start, region_end, region_peak))
                active_start = None
                region_peak = 0.0

        if active_start is not None:
            region_end = min(len(samples), last_active_end + hop_size)
            if region_end - active_start >= min_note_samples:
                regions.append((active_start, region_end, region_peak))

        return regions

    def _estimate_pitch(
        self, samples: list[float], sample_rate: int, start_sample: int, end_sample: int
    ) -> tuple[Optional[float], float]:
        attack_skip = int(sample_rate * 0.01)
        analysis_start = min(end_sample, start_sample + attack_skip)
        analysis_end = min(end_sample, analysis_start + max(1024, int(sample_rate * 0.2)))
        analysis = samples[analysis_start:analysis_end]

        if len(analysis) < 256:
            return None, 0.0

        mean = sum(analysis) / len(analysis)
        centered = [sample - mean for sample in analysis]

        min_frequency = 65.0
        max_frequency = 1200.0
        min_lag = max(2, int(sample_rate / max_frequency))
        max_lag = min(len(centered) // 2, int(sample_rate / min_frequency))

        best_lag: Optional[int] = None
        best_score = 0.0

        for lag in range(min_lag, max_lag + 1):
            overlap = len(centered) - lag
            if overlap <= 0:
                continue

            product = 0.0
            left_energy = 0.0
            right_energy = 0.0

            for index in range(overlap):
                left = centered[index]
                right = centered[index + lag]
                product += left * right
                left_energy += left * left
                right_energy += right * right

            if left_energy <= 1e-9 or right_energy <= 1e-9:
                continue

            score = product / math.sqrt(left_energy * right_energy)
            if score > best_score:
                best_score = score
                best_lag = lag

        if best_lag is None or best_score < 0.35:
            return None, best_score

        return sample_rate / best_lag, min(0.99, best_score)

    def _frequency_to_midi(self, frequency: float) -> Optional[int]:
        if frequency <= 0:
            return None

        midi = round(69 + 12 * math.log2(frequency / 440.0))
        if midi < 21 or midi > 108:
            return None
        return midi

    def _estimate_velocity(self, peak_level: float) -> int:
        scaled = int(peak_level * 220)
        return max(32, min(127, scaled))


class BasicPitchPianoTranscriptionProvider(PianoTranscriptionProvider):
    provider_name = "basic-pitch-piano-provider"

    def __init__(
        self,
        python_executable: Optional[str] = None,
        minimum_confidence: float = 0.35,
    ) -> None:
        self._python_executable = python_executable or sys.executable
        self._minimum_confidence = minimum_confidence
        self._runner_path = Path(__file__).with_name("basic_pitch_runner.py")

    def transcribe(self, stem: SourceStem) -> TranscriptionResult:
        warnings = [
            "Piano transcription attempted the stronger Basic Pitch backend behind the existing provider contract.",
            "Basic Pitch runtime availability depends on the configured Python environment and optional ML dependencies.",
        ]

        raw_note_events = self._run_basic_pitch(stem.file_path)
        notes = self._normalize_note_events(stem, raw_note_events)

        if not notes:
            warnings.append(
                "The Basic Pitch piano provider did not return any note events above the configured confidence threshold for this stem."
            )

        return TranscriptionResult(
            provider_name=self.provider_name,
            instrument="piano",
            source_stem=stem.stem_name,
            notes=notes,
            warnings=warnings,
        )

    def _run_basic_pitch(self, audio_path: Path) -> List[Any]:
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
            raise PianoTranscriptionProviderError(
                f"Basic Pitch Python executable was not found at '{self._python_executable}'."
            ) from exc

        try:
            if completed.returncode != 0:
                detail = completed.stderr.strip() or completed.stdout.strip() or "unknown error"
                raise PianoTranscriptionProviderError(
                    f"Basic Pitch transcription failed with exit code {completed.returncode}: {detail}"
                )

            payload = json.loads(output_path.read_text(encoding="utf-8"))
            if not isinstance(payload, dict) or not isinstance(payload.get("noteEvents"), list):
                raise PianoTranscriptionProviderError("Basic Pitch runner returned an invalid note event payload.")
            return list(payload["noteEvents"])
        finally:
            output_path.unlink(missing_ok=True)

    def _normalize_note_events(self, stem: SourceStem, raw_note_events: Iterable[Any]) -> List[NoteEvent]:
        notes: List[NoteEvent] = []

        for index, raw_event in enumerate(raw_note_events, start=1):
            normalized = self._coerce_basic_pitch_event(raw_event)
            if normalized is None:
                continue

            onset_sec = normalized["onset_sec"]
            offset_sec = normalized["offset_sec"]
            pitch = normalized["pitch"]
            confidence = normalized["confidence"]
            velocity = normalized["velocity"]

            if confidence < self._minimum_confidence:
                continue
            if offset_sec - onset_sec < 0.05:
                continue

            notes.append(
                NoteEvent(
                    id=f"{stem.stem_name}-piano-{index}",
                    instrument="piano",
                    pitch=pitch,
                    onsetSec=round(onset_sec, 3),
                    offsetSec=round(offset_sec, 3),
                    velocity=velocity,
                    confidence=round(confidence, 2),
                    channel=0,
                    sourceStem=stem.stem_name,
                )
            )

        notes.sort(key=lambda note: (note.onset_sec, note.pitch or 0, note.id))
        return notes

    def _coerce_basic_pitch_event(self, raw_event: Any) -> Optional[Dict[str, Any]]:
        start_sec: Optional[float] = None
        end_sec: Optional[float] = None
        pitch: Optional[int] = None
        confidence: Optional[float] = None

        if isinstance(raw_event, dict):
            start_sec = _coerce_float(
                raw_event.get("startSec", raw_event.get("start_time", raw_event.get("start")))
            )
            end_sec = _coerce_float(
                raw_event.get("endSec", raw_event.get("end_time", raw_event.get("end")))
            )
            pitch = _coerce_int(raw_event.get("pitch"))
            confidence = _coerce_float(
                raw_event.get("confidence", raw_event.get("amplitude", raw_event.get("velocity")))
            )
        elif isinstance(raw_event, Sequence) and not isinstance(raw_event, (str, bytes, bytearray)):
            if len(raw_event) >= 3:
                start_sec = _coerce_float(raw_event[0])
                end_sec = _coerce_float(raw_event[1])
                pitch = _coerce_int(raw_event[2])
            if len(raw_event) >= 4:
                confidence = _coerce_float(raw_event[3])

        if start_sec is None or end_sec is None or pitch is None:
            return None
        if end_sec <= start_sec:
            return None
        if pitch < 21 or pitch > 108:
            return None

        safe_confidence = 0.8 if confidence is None else max(0.0, min(1.0, confidence))
        return {
            "onset_sec": max(0.0, start_sec),
            "offset_sec": end_sec,
            "pitch": pitch,
            "confidence": safe_confidence,
            "velocity": _confidence_to_velocity(safe_confidence),
        }


class FallbackPianoTranscriptionProvider(PianoTranscriptionProvider):
    def __init__(self, primary: PianoTranscriptionProvider, fallback: PianoTranscriptionProvider) -> None:
        self._primary = primary
        self._fallback = fallback
        self.provider_name = primary.provider_name

    def transcribe(self, stem: SourceStem) -> TranscriptionResult:
        try:
            return self._primary.transcribe(stem)
        except PianoTranscriptionProviderError as exc:
            fallback_result = self._fallback.transcribe(stem)
            warnings = [
                f"Configured piano transcription provider '{self._primary.provider_name}' was unavailable, so the pipeline fell back to '{fallback_result.provider_name}': {exc}"
            ]
            warnings.extend(fallback_result.warnings)
            return TranscriptionResult(
                provider_name=fallback_result.provider_name,
                instrument=fallback_result.instrument,
                source_stem=fallback_result.source_stem,
                notes=fallback_result.notes,
                warnings=_dedupe_warnings(warnings),
            )


def build_piano_transcription_provider(settings: Settings) -> PianoTranscriptionProvider:
    provider_id = settings.piano_transcription_provider
    fallback_id = settings.piano_transcription_fallback_provider

    primary = _create_provider(provider_id, settings)
    if fallback_id and fallback_id != provider_id:
        fallback = _create_provider(fallback_id, settings)
        return FallbackPianoTranscriptionProvider(primary=primary, fallback=fallback)

    return primary


def _create_provider(provider_id: str, settings: Settings) -> PianoTranscriptionProvider:
    if provider_id == PIANO_TRANSCRIPTION_PROVIDER_HEURISTIC:
        return HeuristicWavPianoTranscriptionProvider()
    if provider_id in {PIANO_TRANSCRIPTION_PROVIDER_ML, PIANO_TRANSCRIPTION_PROVIDER_BASIC_PITCH}:
        return BasicPitchPianoTranscriptionProvider(
            python_executable=settings.piano_transcription_ml_python,
            minimum_confidence=settings.piano_transcription_ml_min_confidence,
        )

    raise ValueError(f"Unsupported piano transcription provider '{provider_id}'.")


def _coerce_float(value: Any) -> Optional[float]:
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _coerce_int(value: Any) -> Optional[int]:
    try:
        if value is None:
            return None
        return int(round(float(value)))
    except (TypeError, ValueError):
        return None


def _confidence_to_velocity(confidence: float) -> int:
    return max(32, min(127, int(round(confidence * 127))))


def _dedupe_warnings(warnings: List[str]) -> List[str]:
    deduped: List[str] = []
    for warning in warnings:
        if warning not in deduped:
            deduped.append(warning)
    return deduped
