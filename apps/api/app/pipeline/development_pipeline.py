from __future__ import annotations

from pathlib import Path

from app.models.schemas import JobResult, TrackResult
from app.pipeline.interfaces import (
    DrumTranscriptionProvider,
    PianoTranscriptionProvider,
    ProcessingPipeline,
    SourceSeparationProvider,
    TranscriptionResult,
)
from app.pipeline.drum_transcription import HeuristicWavDrumTranscriptionProvider
from app.pipeline.piano_transcription import HeuristicWavPianoTranscriptionProvider
from app.pipeline.source_separation import LocalDevelopmentSourceSeparationProvider


class DevelopmentProcessingPipeline:
    def __init__(
        self,
        separation_provider: SourceSeparationProvider,
        piano_provider: PianoTranscriptionProvider,
        drum_provider: DrumTranscriptionProvider,
    ) -> None:
        self._separation_provider = separation_provider
        self._piano_provider = piano_provider
        self._drum_provider = drum_provider

    def run(self, audio_path: Path, original_file_name: str, job_id: str) -> JobResult:
        stems = self._separation_provider.separate(audio_path, job_id)
        transcriptions: list[TranscriptionResult] = []
        warnings = [
            "Source separation is still a local development backend that persists placeholder stems by copying the uploaded file.",
        ]

        for stem in stems:
            if stem.instrument_hint == "piano":
                transcriptions.append(self._piano_provider.transcribe(stem))
            elif stem.instrument_hint == "drums":
                transcriptions.append(self._drum_provider.transcribe(stem))

        for transcription in transcriptions:
            for warning in transcription.warnings:
                if warning not in warnings:
                    warnings.append(warning)

        tracks = [
            TrackResult(
                instrument=transcription.instrument,
                sourceStem=transcription.source_stem,
                provider=transcription.provider_name,
                eventCount=len(transcription.notes),
                notes=transcription.notes,
            )
            for transcription in transcriptions
        ]

        return JobResult(
            projectName=Path(original_file_name).stem,
            bpm=120,
            stems=[stem.stem_asset for stem in stems],
            tracks=tracks,
            warnings=warnings,
        )


def build_development_pipeline() -> ProcessingPipeline:
    return DevelopmentProcessingPipeline(
        separation_provider=LocalDevelopmentSourceSeparationProvider(),
        piano_provider=HeuristicWavPianoTranscriptionProvider(),
        drum_provider=HeuristicWavDrumTranscriptionProvider(),
    )
