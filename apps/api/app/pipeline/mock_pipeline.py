from __future__ import annotations

from pathlib import Path

from app.models.schemas import JobResult, NoteEvent, TrackResult
from app.pipeline.interfaces import (
    DrumTranscriptionProvider,
    PianoTranscriptionProvider,
    ProcessingPipeline,
    SourceSeparationProvider,
    SourceStem,
    TranscriptionResult,
)
from app.pipeline.piano_transcription import HeuristicWavPianoTranscriptionProvider
from app.pipeline.source_separation import LocalDevelopmentSourceSeparationProvider


class MockDrumTranscriptionProvider:
    provider_name = "mock-drum-provider"

    def transcribe(self, stem: SourceStem) -> TranscriptionResult:
        notes = [
            NoteEvent(
                id=f"{stem.stem_name}-d1",
                instrument="drums",
                drumLabel="kick",
                midiNote=36,
                onsetSec=0.0,
                offsetSec=0.05,
                velocity=110,
                confidence=0.91,
                channel=9,
                bar=1,
                beat=1.0,
                sourceStem=stem.stem_name,
            ),
            NoteEvent(
                id=f"{stem.stem_name}-d2",
                instrument="drums",
                drumLabel="snare",
                midiNote=38,
                onsetSec=0.5,
                offsetSec=0.55,
                velocity=104,
                confidence=0.88,
                channel=9,
                bar=1,
                beat=2.0,
                sourceStem=stem.stem_name,
            ),
            NoteEvent(
                id=f"{stem.stem_name}-d3",
                instrument="drums",
                drumLabel="hi-hat",
                midiNote=42,
                onsetSec=1.0,
                offsetSec=1.05,
                velocity=82,
                confidence=0.86,
                channel=9,
                bar=1,
                beat=3.0,
                sourceStem=stem.stem_name,
            ),
        ]

        return TranscriptionResult(
            provider_name=self.provider_name,
            instrument="drums",
            source_stem=stem.stem_name,
            notes=notes,
            warnings=["Drum transcription remains mocked in Phase 3 and has not been replaced with a real provider yet."],
        )


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


def build_mock_pipeline() -> ProcessingPipeline:
    return DevelopmentProcessingPipeline(
        separation_provider=LocalDevelopmentSourceSeparationProvider(),
        piano_provider=HeuristicWavPianoTranscriptionProvider(),
        drum_provider=MockDrumTranscriptionProvider(),
    )
