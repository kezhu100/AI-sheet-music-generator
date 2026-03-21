from __future__ import annotations

import audioop
from dataclasses import dataclass
import struct
import wave
from pathlib import Path
from tempfile import TemporaryDirectory

from fastapi import HTTPException, status

from app.core.config import Settings, get_settings
from app.models.schemas import NoteEvent, ProviderPreferences, RegionRetranscriptionRequest, StemAsset, TrackResult
from app.pipeline.drum_transcription import build_drum_transcription_provider
from app.pipeline.interfaces import SourceStem, TranscriptionResult
from app.pipeline.piano_transcription import build_piano_transcription_provider
from app.pipeline.post_processing import LightweightPostProcessor
from app.services.provider_preferences import resolve_settings_with_provider_preferences
from app.services.storage import resolve_project_path


@dataclass(frozen=True)
class RegionRetranscriptionRunResult:
    notes: list[NoteEvent]
    provider_used: str


class RegionRetranscriptionService:
    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()
        self._post_processor = LightweightPostProcessor()

    def retranscribe_region(
        self,
        *,
        job_id: str,
        result_stems: list[StemAsset],
        request: RegionRetranscriptionRequest,
        provider_preferences: ProviderPreferences | None = None,
    ) -> RegionRetranscriptionRunResult:
        stem_asset = self._resolve_stem_asset(result_stems, request.instrument)
        stem_path = resolve_project_path(stem_asset.stored_path)

        if stem_path.suffix.lower() != ".wav":
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Region re-transcription currently supports only persisted PCM .wav stems.",
            )

        with TemporaryDirectory() as temp_dir:
            segment_path = Path(temp_dir) / f"{job_id}-{request.instrument}-region.wav"
            self._extract_wav_region(
                source_path=stem_path,
                target_path=segment_path,
                start_sec=request.start_sec,
                end_sec=request.end_sec,
            )

            source_stem = SourceStem(
                stem_name=stem_asset.stem_name,
                instrument_hint=stem_asset.instrument_hint,
                file_path=segment_path,
                stem_asset=stem_asset,
            )
            transcription_result = self._transcribe_region(source_stem, request.instrument, provider_preferences)

        processed = self._post_processor.process(
            [
                TrackResult(
                    instrument=request.instrument,
                    sourceStem=transcription_result.source_stem,
                    provider=transcription_result.provider_name,
                    eventCount=len(transcription_result.notes),
                    notes=transcription_result.notes,
                )
            ],
            warnings=transcription_result.warnings,
        )

        if not processed.tracks:
            return RegionRetranscriptionRunResult(notes=[], provider_used=transcription_result.provider_name)

        absolute_notes = [
            self._offset_note_to_absolute_time(note, request.start_sec)
            for note in processed.tracks[0].notes
        ]
        filtered_notes = [
            note
            for note in absolute_notes
            if self._note_overlaps_range(note, request.start_sec, request.end_sec)
        ]
        return RegionRetranscriptionRunResult(notes=filtered_notes, provider_used=processed.tracks[0].provider)

    def _resolve_stem_asset(self, stems: list[StemAsset], instrument: str) -> StemAsset:
        expected_stem_name = "piano_stem" if instrument == "piano" else "drum_stem"
        for stem in stems:
            if stem.stem_name == expected_stem_name:
                return stem

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No persisted {instrument} stem is available for region re-transcription.",
        )

    def _transcribe_region(
        self,
        stem: SourceStem,
        instrument: str,
        provider_preferences: ProviderPreferences | None,
    ) -> TranscriptionResult:
        try:
            settings = resolve_settings_with_provider_preferences(provider_preferences, self._settings)
            if instrument == "piano":
                provider = build_piano_transcription_provider(settings)
                return provider.transcribe(stem)

            provider = build_drum_transcription_provider(settings)
            return provider.transcribe(stem)
        except (RuntimeError, ValueError) as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Region re-transcription could not run the configured {instrument} provider: {exc}",
            ) from exc

    def _offset_note_to_absolute_time(self, note: NoteEvent, start_sec: float) -> NoteEvent:
        updated_offset = None if note.offset_sec is None else round(note.offset_sec + start_sec, 3)
        return note.model_copy(
            update={
                "onset_sec": round(note.onset_sec + start_sec, 3),
                "offset_sec": updated_offset,
            }
        )

    def _note_overlaps_range(self, note: NoteEvent, start_sec: float, end_sec: float) -> bool:
        note_end = note.offset_sec if note.offset_sec is not None else note.onset_sec
        return note.onset_sec < end_sec and note_end > start_sec

    def _extract_wav_region(self, *, source_path: Path, target_path: Path, start_sec: float, end_sec: float) -> None:
        try:
            with wave.open(str(source_path), "rb") as source_wav:
                if source_wav.getcomptype() != "NONE":
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail="Region re-transcription currently supports only uncompressed PCM .wav stems.",
                    )

                sample_width = source_wav.getsampwidth()
                if sample_width not in {1, 2, 4}:
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail="Region re-transcription currently supports PCM .wav stems with 8-bit, 16-bit, or 32-bit sample widths.",
                    )

                frame_rate = source_wav.getframerate()
                frame_count = source_wav.getnframes()
                channel_count = source_wav.getnchannels()

                start_frame = max(0, min(frame_count, int(start_sec * frame_rate)))
                end_frame = max(start_frame + 1, min(frame_count, int(end_sec * frame_rate)))
                source_wav.setpos(start_frame)
                raw_frames = source_wav.readframes(end_frame - start_frame)

            mono_frames = self._convert_to_mono(raw_frames, sample_width, channel_count)
            with wave.open(str(target_path), "wb") as target_wav:
                target_wav.setnchannels(1)
                target_wav.setsampwidth(sample_width)
                target_wav.setframerate(frame_rate)
                target_wav.writeframes(mono_frames)
        except wave.Error as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Failed to extract a PCM .wav region from the persisted stem: {exc}",
            ) from exc

    def _convert_to_mono(self, raw_frames: bytes, sample_width: int, channel_count: int) -> bytes:
        if channel_count <= 1:
            return raw_frames

        if channel_count == 2:
            return audioop.tomono(raw_frames, sample_width, 0.5, 0.5)

        if sample_width == 1:
            values = list(raw_frames)
            step = channel_count
            mono_values = [
                min(255, max(0, int(round(sum(values[index : index + step]) / step))))
                for index in range(0, len(values), step)
            ]
            return bytes(mono_values)

        format_code = "h" if sample_width == 2 else "i"
        sample_count = len(raw_frames) // sample_width
        unpacked = struct.unpack(f"<{sample_count}{format_code}", raw_frames)
        mono_values = []
        for index in range(0, len(unpacked), channel_count):
            frame_values = unpacked[index : index + channel_count]
            mono_values.append(int(round(sum(frame_values) / len(frame_values))))
        return struct.pack(f"<{len(mono_values)}{format_code}", *mono_values)
