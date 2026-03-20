from __future__ import annotations

import audioop
import math
import struct
import sys
import wave
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import List, Optional

from app.core.config import Settings
from app.models.schemas import NoteEvent
from app.pipeline.interfaces import DrumTranscriptionProvider, SourceStem, TranscriptionResult
from app.pipeline.source_separation import (
    SourceSeparationProviderError,
    find_demucs_output_file,
    run_demucs_separation_command,
)

DRUM_TRANSCRIPTION_PROVIDER_HEURISTIC = "heuristic"
DRUM_TRANSCRIPTION_PROVIDER_DEMUCS_ONSET = "demucs-drums"
DRUM_TRANSCRIPTION_PROVIDER_ML = "ml"
DRUM_TRANSCRIPTION_PROVIDER_MADMOM = "madmom"
LEGACY_ENHANCED_DRUM_PROVIDER_IDS = {
    DRUM_TRANSCRIPTION_PROVIDER_ML,
    DRUM_TRANSCRIPTION_PROVIDER_MADMOM,
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


class DemucsOnsetDrumTranscriptionProvider(DrumTranscriptionProvider):
    provider_name = "demucs-onset-drum-provider"

    def __init__(
        self,
        *,
        python_executable: Optional[str] = None,
        model_name: str = "htdemucs",
        device: Optional[str] = None,
        drums_source_name: str = "drums",
        minimum_confidence: float = 0.35,
    ) -> None:
        self._python_executable = python_executable or sys.executable
        self._model_name = model_name
        self._device = device
        self._drums_source_name = drums_source_name
        self._minimum_confidence = minimum_confidence
        self._fallback_classifier = HeuristicWavDrumTranscriptionProvider()

    def transcribe(self, stem: SourceStem) -> TranscriptionResult:
        warnings = [
            "Drum transcription used Demucs drum stem isolation plus a lightweight rule-based onset detector.",
            "This enhanced drum provider stays deterministic and local-first; dense fills, cymbal detail, and ghost notes can still be simplified.",
        ]

        try:
            samples, sample_rate, analysis_warnings = self._load_analysis_samples(stem)
        except UnsupportedDrumStemError as exc:
            warnings.append(str(exc))
            return TranscriptionResult(
                provider_name=self.provider_name,
                instrument="drums",
                source_stem=stem.stem_name,
                notes=[],
                warnings=warnings,
            )
        except SourceSeparationProviderError as exc:
            raise DrumTranscriptionProviderError(str(exc)) from exc

        warnings.extend(analysis_warnings)
        hits = self._detect_demucs_hits(samples, sample_rate)
        notes = self._build_note_events(stem, samples, sample_rate, hits)

        if not notes:
            warnings.append(
                "The Demucs drum stem did not yield stable onset peaks above the current rule thresholds. The built-in heuristic drum provider remains the stable fallback."
            )

        return TranscriptionResult(
            provider_name=self.provider_name,
            instrument="drums",
            source_stem=stem.stem_name,
            notes=notes,
            warnings=_dedupe_warnings(warnings),
        )

    def _load_analysis_samples(self, stem: SourceStem) -> tuple[list[float], int, list[str]]:
        if stem.file_path.suffix.lower() == ".wav" and stem.stem_asset.provider == "demucs-separation":
            samples, sample_rate = self._fallback_classifier._load_wav_samples(stem.file_path)
            return (
                samples,
                sample_rate,
                ["Drum transcription reused the persisted Demucs drum stem from source separation."],
            )

        with TemporaryDirectory() as temp_dir:
            output_dir = Path(temp_dir) / "demucs-output"
            run_demucs_separation_command(
                stem.file_path,
                output_dir=output_dir,
                python_executable=self._python_executable,
                model_name=self._model_name,
                device=self._device,
            )
            drum_stem_path = find_demucs_output_file(output_dir, self._drums_source_name)
            samples, sample_rate = self._fallback_classifier._load_wav_samples(drum_stem_path)
            return (
                samples,
                sample_rate,
                ["Drum transcription ran a local Demucs pass to isolate the drum stem before onset detection."],
            )

    def _detect_demucs_hits(self, samples: list[float], sample_rate: int) -> list[tuple[int, int, float]]:
        if not samples:
            return []

        window_size = max(256, int(sample_rate * 0.02))
        hop_size = max(128, int(sample_rate * 0.005))
        refractory_samples = max(hop_size, int(sample_rate * 0.07))
        max_hit_samples = int(sample_rate * 0.14)
        min_hit_samples = int(sample_rate * 0.05)
        backtrack_frames = max(2, int(round(0.02 / max(0.001, hop_size / sample_rate))))

        frame_levels: list[tuple[int, float, float, float]] = []
        previous_level = 0.0
        previous_high = 0.0
        max_strength = 0.0

        for start in range(0, len(samples), hop_size):
            end = min(len(samples), start + window_size)
            if end <= start:
                continue

            frame = samples[start:end]
            level = sum(abs(sample) for sample in frame) / len(frame)
            high_level = self._estimate_high_band_level(frame)
            low_level = max(0.0, level - high_level)
            energy_rise = max(0.0, level - previous_level)
            high_rise = max(0.0, high_level - previous_high)
            onset_strength = (energy_rise * 0.55) + (high_rise * 0.45) + max(0.0, level - low_level) * 0.05
            frame_levels.append((start, level, high_level, onset_strength))
            max_strength = max(max_strength, onset_strength)
            previous_level = level
            previous_high = high_level

        if max_strength <= 0.0:
            return []

        strength_threshold = max(0.01, max_strength * 0.32)
        level_threshold = max(0.015, max(level for _, level, _, _ in frame_levels) * 0.18)
        peak_indices: list[int] = []
        last_peak_start = -refractory_samples

        for index, (frame_start, level, _, onset_strength) in enumerate(frame_levels):
            if level < level_threshold or onset_strength < strength_threshold:
                continue

            left_strength = frame_levels[index - 1][3] if index > 0 else onset_strength
            right_strength = frame_levels[index + 1][3] if index + 1 < len(frame_levels) else onset_strength
            if onset_strength < left_strength or onset_strength < right_strength:
                continue
            if frame_start - last_peak_start < refractory_samples:
                continue

            peak_indices.append(index)
            last_peak_start = frame_start

        hits: list[tuple[int, int, float]] = []
        for peak_position, frame_index in enumerate(peak_indices):
            frame_start, _, _, _ = frame_levels[frame_index]
            backtrack_start = max(0, frame_index - backtrack_frames)
            candidate_frames = frame_levels[backtrack_start : frame_index + 1]
            best_frame = min(candidate_frames, key=lambda item: item[1])
            start_sample = best_frame[0]

            next_start = (
                frame_levels[peak_indices[peak_position + 1]][0]
                if peak_position + 1 < len(peak_indices)
                else min(len(samples), frame_start + max_hit_samples)
            )
            end_sample = min(len(samples), max(start_sample + min_hit_samples, min(frame_start + max_hit_samples, next_start)))
            if end_sample <= start_sample:
                continue

            segment = samples[start_sample:end_sample]
            peak_level = max((abs(sample) for sample in segment), default=0.0)
            if peak_level <= 0.0:
                continue

            hits.append((start_sample, end_sample, min(1.0, peak_level)))

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

    def _estimate_high_band_level(self, frame: list[float]) -> float:
        low_pass_value = 0.0
        high_total = 0.0
        for sample in frame:
            low_pass_value = (low_pass_value * 0.95) + (sample * 0.05)
            high_total += abs(sample - low_pass_value)
        return high_total / max(1, len(frame))


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
    if provider_id == DRUM_TRANSCRIPTION_PROVIDER_DEMUCS_ONSET or provider_id in LEGACY_ENHANCED_DRUM_PROVIDER_IDS:
        return DemucsOnsetDrumTranscriptionProvider(
            python_executable=settings.drum_transcription_ml_python or settings.source_separation_demucs_python,
            model_name=settings.source_separation_demucs_model,
            device=settings.source_separation_demucs_device,
            drums_source_name=settings.source_separation_demucs_drums_source,
            minimum_confidence=settings.drum_transcription_ml_min_confidence,
        )

    raise ValueError(f"Unsupported drum transcription provider '{provider_id}'.")


def _dedupe_warnings(warnings: List[str]) -> List[str]:
    deduped: List[str] = []
    for warning in warnings:
        if warning not in deduped:
            deduped.append(warning)
    return deduped
