from __future__ import annotations

import audioop
import math
import struct
import wave
from pathlib import Path
from typing import Optional

from app.models.schemas import NoteEvent
from app.pipeline.interfaces import PianoTranscriptionProvider, SourceStem, TranscriptionResult


class UnsupportedPianoStemError(Exception):
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
                f"Skipping real piano transcription for stem '{stem.stem_name}' because only PCM .wav stems are supported in Phase 3."
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
                "The heuristic piano provider did not detect reliable note regions in this stem. Simple isolated piano notes work best in Phase 3."
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
