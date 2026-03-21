from __future__ import annotations

from pathlib import Path

from app.core.config import Settings, get_settings
from app.models.schemas import JobResult, ProcessingPreferences, TrackResult
from app.pipeline.interfaces import (
    DrumTranscriptionProvider,
    PianoTranscriptionProvider,
    ProcessingPipeline,
    SourceSeparationProvider,
    SourceSeparationRunResult,
    TranscriptionResult,
)
from app.pipeline.drum_transcription import build_drum_transcription_provider
from app.pipeline.post_processing import LightweightPostProcessor
from app.pipeline.piano_transcription import build_piano_transcription_provider
from app.pipeline.source_separation import build_source_separation_provider
from app.services.audio_preprocessing import LocalAudioPreprocessor, NormalizedAudioFile
from app.services.piano_stem_filtering import PianoStemFilterError, PianoStemFilterService


class DevelopmentProcessingPipeline:
    def __init__(
        self,
        separation_provider: SourceSeparationProvider,
        piano_provider: PianoTranscriptionProvider,
        drum_provider: DrumTranscriptionProvider,
        post_processor: LightweightPostProcessor,
        audio_preprocessor: LocalAudioPreprocessor,
        piano_stem_filter_service: PianoStemFilterService,
    ) -> None:
        self._separation_provider = separation_provider
        self._piano_provider = piano_provider
        self._drum_provider = drum_provider
        self._post_processor = post_processor
        self._audio_preprocessor = audio_preprocessor
        self._piano_stem_filter_service = piano_stem_filter_service

    def run(
        self,
        audio_path: Path,
        original_file_name: str,
        job_id: str,
        processing_preferences: ProcessingPreferences | None = None,
    ) -> JobResult:
        normalized_audio: NormalizedAudioFile = self._audio_preprocessor.normalize(audio_path, original_file_name, job_id)
        separation_result: SourceSeparationRunResult = self._separation_provider.separate(normalized_audio.path, job_id)
        stems = separation_result.stems
        transcriptions: list[TranscriptionResult] = []
        warnings = list(normalized_audio.warnings)
        warnings.extend(separation_result.warnings)
        result_stem_assets = []

        for stem in stems:
            if stem.instrument_hint == "piano":
                try:
                    filtered_piano_stem = self._piano_stem_filter_service.build_filtered_piano_stem(
                        stem=stem,
                        job_id=job_id,
                        preferences=processing_preferences,
                    )
                except PianoStemFilterError as exc:
                    warnings.append(str(exc))
                    transcriptions.append(self._piano_provider.transcribe(stem))
                    result_stem_assets.append(stem.stem_asset)
                else:
                    warnings.extend(filtered_piano_stem.warnings)
                    transcriptions.append(self._piano_provider.transcribe(filtered_piano_stem.transcription_stem))
                    result_stem_assets.extend(filtered_piano_stem.exported_stems)
            elif stem.instrument_hint == "drums":
                transcriptions.append(self._drum_provider.transcribe(stem))
                result_stem_assets.append(stem.stem_asset)
            else:
                result_stem_assets.append(stem.stem_asset)

        for transcription in transcriptions:
            for warning in transcription.warnings:
                if warning not in warnings:
                    warnings.append(warning)

        raw_tracks = [
            TrackResult(
                instrument=transcription.instrument,
                sourceStem=transcription.source_stem,
                provider=transcription.provider_name,
                eventCount=len(transcription.notes),
                notes=transcription.notes,
            )
            for transcription in transcriptions
        ]
        post_processing_result = self._post_processor.process(raw_tracks, warnings)

        return JobResult(
            projectName=Path(original_file_name).stem,
            bpm=post_processing_result.bpm,
            stems=result_stem_assets,
            tracks=post_processing_result.tracks,
            warnings=post_processing_result.warnings,
        )


def build_processing_pipeline(settings: Settings | None = None) -> ProcessingPipeline:
    resolved_settings = settings or get_settings()
    return DevelopmentProcessingPipeline(
        separation_provider=build_source_separation_provider(resolved_settings),
        piano_provider=build_piano_transcription_provider(resolved_settings),
        drum_provider=build_drum_transcription_provider(resolved_settings),
        post_processor=LightweightPostProcessor(),
        audio_preprocessor=LocalAudioPreprocessor(resolved_settings),
        piano_stem_filter_service=PianoStemFilterService(),
    )


def build_development_pipeline(settings: Settings | None = None) -> ProcessingPipeline:
    return build_processing_pipeline(settings)
