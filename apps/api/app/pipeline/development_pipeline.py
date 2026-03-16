from __future__ import annotations

from pathlib import Path

from app.core.config import Settings, get_settings
from app.models.schemas import JobResult, TrackResult
from app.pipeline.interfaces import (
    DrumTranscriptionProvider,
    PianoTranscriptionProvider,
    ProcessingPipeline,
    SourceSeparationProvider,
    SourceSeparationRunResult,
    TranscriptionResult,
)
from app.pipeline.drum_transcription import HeuristicWavDrumTranscriptionProvider
from app.pipeline.post_processing import LightweightPostProcessor
from app.pipeline.piano_transcription import build_piano_transcription_provider
from app.pipeline.source_separation import build_source_separation_provider


class DevelopmentProcessingPipeline:
    def __init__(
        self,
        separation_provider: SourceSeparationProvider,
        piano_provider: PianoTranscriptionProvider,
        drum_provider: DrumTranscriptionProvider,
        post_processor: LightweightPostProcessor,
    ) -> None:
        self._separation_provider = separation_provider
        self._piano_provider = piano_provider
        self._drum_provider = drum_provider
        self._post_processor = post_processor

    def run(self, audio_path: Path, original_file_name: str, job_id: str) -> JobResult:
        separation_result: SourceSeparationRunResult = self._separation_provider.separate(audio_path, job_id)
        stems = separation_result.stems
        transcriptions: list[TranscriptionResult] = []
        warnings = list(separation_result.warnings)

        for stem in stems:
            if stem.instrument_hint == "piano":
                transcriptions.append(self._piano_provider.transcribe(stem))
            elif stem.instrument_hint == "drums":
                transcriptions.append(self._drum_provider.transcribe(stem))

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
            stems=[stem.stem_asset for stem in stems],
            tracks=post_processing_result.tracks,
            warnings=post_processing_result.warnings,
        )


def build_processing_pipeline(settings: Settings | None = None) -> ProcessingPipeline:
    resolved_settings = settings or get_settings()
    return DevelopmentProcessingPipeline(
        separation_provider=build_source_separation_provider(resolved_settings),
        piano_provider=build_piano_transcription_provider(resolved_settings),
        drum_provider=HeuristicWavDrumTranscriptionProvider(),
        post_processor=LightweightPostProcessor(),
    )


def build_development_pipeline(settings: Settings | None = None) -> ProcessingPipeline:
    return build_processing_pipeline(settings)
