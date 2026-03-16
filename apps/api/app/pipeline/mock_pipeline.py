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
from app.pipeline.source_separation import LocalDevelopmentSourceSeparationProvider


class MockPianoTranscriptionProvider:
    provider_name = "mock-piano-provider"

    def transcribe(self, stem: SourceStem) -> TranscriptionResult:
        notes = [
            NoteEvent(
                id=f"{stem.stem_name}-p1",
                instrument="piano",
                pitch=60,
                onsetSec=0.0,
                offsetSec=0.8,
                velocity=96,
                confidence=0.94,
                channel=0,
                bar=1,
                beat=1.0,
                sourceStem=stem.stem_name,
            ),
            NoteEvent(
                id=f"{stem.stem_name}-p2",
                instrument="piano",
                pitch=64,
                onsetSec=0.8,
                offsetSec=1.4,
                velocity=88,
                confidence=0.9,
                channel=0,
                bar=1,
                beat=3.0,
                sourceStem=stem.stem_name,
            ),
            NoteEvent(
                id=f"{stem.stem_name}-p3",
                instrument="piano",
                pitch=67,
                onsetSec=1.4,
                offsetSec=2.1,
                velocity=92,
                confidence=0.89,
                channel=0,
                bar=2,
                beat=1.0,
                sourceStem=stem.stem_name,
            ),
        ]

        return TranscriptionResult(
            provider_name=self.provider_name,
            instrument="piano",
            source_stem=stem.stem_name,
            notes=notes,
        )


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
        )


class MockProcessingPipeline:
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

        for stem in stems:
            if stem.instrument_hint == "piano":
                transcriptions.append(self._piano_provider.transcribe(stem))
            elif stem.instrument_hint == "drums":
                transcriptions.append(self._drum_provider.transcribe(stem))

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
            warnings=[
                "Source separation is a local development backend that persists placeholder stems by copying the uploaded file.",
                "Piano and drum note events are still mocked and do not reflect real transcription output yet.",
            ],
        )


def build_mock_pipeline() -> ProcessingPipeline:
    return MockProcessingPipeline(
        separation_provider=LocalDevelopmentSourceSeparationProvider(),
        piano_provider=MockPianoTranscriptionProvider(),
        drum_provider=MockDrumTranscriptionProvider(),
    )
