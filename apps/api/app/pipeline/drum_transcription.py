from __future__ import annotations

import audioop
import math
import struct
import wave
from pathlib import Path

from app.models.schemas import NoteEvent
from app.pipeline.interfaces import DrumTranscriptionProvider, SourceStem, TranscriptionResult


class UnsupportedDrumStemError(Exception):
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
                f"Skipping real drum transcription for stem '{stem.stem_name}' because only PCM .wav stems are supported in Phase 4."
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

        if not notes:
            warnings.append(
                "The heuristic drum provider did not detect reliable percussive onsets in this stem. Clear isolated hits and simple rhythms work best in Phase 4."
            )

        return TranscriptionResult(
            provider_name=self.provider_name,
            instrument="drums",
            source_stem=stem.stem_name,
            notes=notes,
            warnings=warnings,
        )

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
