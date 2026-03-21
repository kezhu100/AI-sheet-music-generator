from __future__ import annotations

import struct
import wave
from dataclasses import dataclass
from pathlib import Path

from app.core.config import get_settings
from app.models.schemas import PianoFilterSettings, ProcessingPreferences, StemAsset
from app.pipeline.interfaces import SourceStem
from app.services.storage import resolve_project_path


class PianoStemFilterError(RuntimeError):
    pass


@dataclass(frozen=True)
class PianoStemFilterResult:
    transcription_stem: SourceStem
    exported_stems: list[StemAsset]
    warnings: list[str]


def default_processing_preferences() -> ProcessingPreferences:
    return ProcessingPreferences()


class PianoStemFilterService:
    def build_filtered_piano_stem(
        self,
        *,
        stem: SourceStem,
        job_id: str,
        preferences: ProcessingPreferences | None = None,
    ) -> PianoStemFilterResult:
        processing_preferences = preferences or default_processing_preferences()
        filter_settings = processing_preferences.piano_filter
        filtered_path = self._write_filtered_wav(stem.file_path, job_id, filter_settings)
        settings = get_settings()
        filtered_asset = StemAsset(
            stemName="piano_stem_filtered",
            instrumentHint="piano",
            provider=f"{stem.stem_asset.provider}+piano-prefilter",
            storedPath=str(filtered_path.relative_to(settings.project_root)).replace("\\", "/"),
            fileName=filtered_path.name,
            fileFormat=filtered_path.suffix.lstrip(".").lower() or "bin",
            sizeBytes=filtered_path.stat().st_size,
        )
        canonical_filtered_asset = filtered_asset.model_copy(
            update={
                "stem_name": "piano_stem",
            }
        )
        raw_asset = stem.stem_asset.model_copy(
            update={
                "stem_name": "piano_stem_raw",
                "instrument_hint": "piano",
            }
        )
        transcription_stem = SourceStem(
            stem_name="piano_stem",
            instrument_hint="piano",
            file_path=resolve_project_path(canonical_filtered_asset.stored_path),
            stem_asset=canonical_filtered_asset,
        )
        warnings = [
            self._build_filter_warning(filter_settings),
        ]
        return PianoStemFilterResult(
            transcription_stem=transcription_stem,
            exported_stems=[canonical_filtered_asset, raw_asset],
            warnings=warnings,
        )

    def _write_filtered_wav(self, source_path: Path, job_id: str, settings: PianoFilterSettings) -> Path:
        if source_path.suffix.lower() != ".wav":
            raise PianoStemFilterError("Piano pre-filtering currently supports only persisted PCM .wav stems.")

        destination = get_settings().stems_dir / job_id / "piano_stem_filtered.wav"
        destination.parent.mkdir(parents=True, exist_ok=True)
        try:
            with wave.open(str(source_path), "rb") as source_wav:
                if source_wav.getcomptype() != "NONE":
                    raise PianoStemFilterError("Piano pre-filtering supports only uncompressed PCM .wav stems.")

                sample_width = source_wav.getsampwidth()
                if sample_width not in {1, 2, 4}:
                    raise PianoStemFilterError("Piano pre-filtering supports PCM .wav stems with 8-bit, 16-bit, or 32-bit sample widths.")

                frame_rate = source_wav.getframerate()
                channel_count = source_wav.getnchannels()
                raw_frames = source_wav.readframes(source_wav.getnframes())

            filtered_frames = self._filter_frames(
                raw_frames=raw_frames,
                sample_width=sample_width,
                sample_rate=frame_rate,
                channel_count=channel_count,
                settings=settings,
            )

            with wave.open(str(destination), "wb") as target_wav:
                target_wav.setnchannels(channel_count)
                target_wav.setsampwidth(sample_width)
                target_wav.setframerate(frame_rate)
                target_wav.writeframes(filtered_frames)
        except wave.Error as exc:
            raise PianoStemFilterError(f"Failed to read or write the filtered piano stem: {exc}") from exc

        return destination

    def _filter_frames(
        self,
        *,
        raw_frames: bytes,
        sample_width: int,
        sample_rate: int,
        channel_count: int,
        settings: PianoFilterSettings,
    ) -> bytes:
        if not settings.enabled:
            return raw_frames

        samples = self._unpack_frames(raw_frames, sample_width)
        if channel_count <= 0:
            return raw_frames

        channels = [samples[index::channel_count] for index in range(channel_count)]
        filtered_channels = [
            self._blend_filtered_channel(channel, sample_rate, settings)
            for channel in channels
        ]

        interleaved: list[float] = []
        for frame_index in range(len(filtered_channels[0]) if filtered_channels else 0):
            for channel in filtered_channels:
                interleaved.append(channel[frame_index])
        return self._pack_frames(interleaved, sample_width)

    def _blend_filtered_channel(
        self,
        channel_samples: list[float],
        sample_rate: int,
        settings: PianoFilterSettings,
    ) -> list[float]:
        if not channel_samples:
            return []

        filtered = self._high_pass(channel_samples, sample_rate, settings.low_cut_hz)
        filtered = self._low_pass(filtered, sample_rate, settings.high_cut_hz)
        wet_mix = min(0.9, max(0.0, settings.cleanup_strength))
        dry_mix = 1.0 - wet_mix
        return [
            max(-1.0, min(1.0, (dry_sample * dry_mix) + (wet_sample * wet_mix)))
            for dry_sample, wet_sample in zip(channel_samples, filtered)
        ]

    def _high_pass(self, samples: list[float], sample_rate: int, cutoff_hz: float) -> list[float]:
        if cutoff_hz <= 0:
            return list(samples)

        dt = 1.0 / max(1, sample_rate)
        rc = 1.0 / (2.0 * 3.141592653589793 * cutoff_hz)
        alpha = rc / (rc + dt)

        output = [samples[0]]
        previous_input = samples[0]
        previous_output = samples[0]
        for sample in samples[1:]:
            next_output = alpha * (previous_output + sample - previous_input)
            output.append(next_output)
            previous_input = sample
            previous_output = next_output
        return output

    def _low_pass(self, samples: list[float], sample_rate: int, cutoff_hz: float) -> list[float]:
        nyquist = sample_rate / 2.0
        if cutoff_hz >= nyquist:
            return list(samples)

        dt = 1.0 / max(1, sample_rate)
        rc = 1.0 / (2.0 * 3.141592653589793 * cutoff_hz)
        alpha = dt / (rc + dt)

        output = [samples[0]]
        previous_output = samples[0]
        for sample in samples[1:]:
            next_output = previous_output + alpha * (sample - previous_output)
            output.append(next_output)
            previous_output = next_output
        return output

    def _unpack_frames(self, raw_frames: bytes, sample_width: int) -> list[float]:
        if sample_width == 1:
            return [((sample - 128) / 128.0) for sample in raw_frames]
        if sample_width == 2:
            sample_count = len(raw_frames) // 2
            unpacked = struct.unpack(f"<{sample_count}h", raw_frames)
            return [sample / 32768.0 for sample in unpacked]
        sample_count = len(raw_frames) // 4
        unpacked = struct.unpack(f"<{sample_count}i", raw_frames)
        return [sample / 2147483648.0 for sample in unpacked]

    def _pack_frames(self, samples: list[float], sample_width: int) -> bytes:
        if sample_width == 1:
            quantized = [min(255, max(0, int(round((sample * 128.0) + 128.0)))) for sample in samples]
            return bytes(quantized)
        if sample_width == 2:
            quantized = [min(32767, max(-32768, int(round(sample * 32767.0)))) for sample in samples]
            return struct.pack(f"<{len(quantized)}h", *quantized)
        quantized = [min(2147483647, max(-2147483648, int(round(sample * 2147483647.0)))) for sample in samples]
        return struct.pack(f"<{len(quantized)}i", *quantized)

    def _build_filter_warning(self, settings: PianoFilterSettings) -> str:
        if not settings.enabled:
            return "Piano pre-filtering was disabled, so the filtered preview currently matches the raw separated piano stem."
        return (
            "Piano transcription and preview used the filtered piano stem "
            f"(low-cut {settings.low_cut_hz:.0f} Hz, high-cut {settings.high_cut_hz:.0f} Hz, cleanup strength {settings.cleanup_strength:.2f})."
        )
