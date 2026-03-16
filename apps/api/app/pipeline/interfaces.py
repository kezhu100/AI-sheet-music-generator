from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import List, Protocol

from app.models.schemas import JobResult, NoteEvent, StemAsset


@dataclass(frozen=True)
class SourceStem:
    stem_name: str
    instrument_hint: str
    file_path: Path
    stem_asset: StemAsset


@dataclass(frozen=True)
class TranscriptionResult:
    provider_name: str
    instrument: str
    source_stem: str
    notes: list[NoteEvent]


class SourceSeparationProvider(Protocol):
    provider_name: str

    def separate(self, audio_path: Path, job_id: str) -> List[SourceStem]:
        ...


class PianoTranscriptionProvider(Protocol):
    provider_name: str

    def transcribe(self, stem: SourceStem) -> TranscriptionResult:
        ...


class DrumTranscriptionProvider(Protocol):
    provider_name: str

    def transcribe(self, stem: SourceStem) -> TranscriptionResult:
        ...


class ProcessingPipeline(Protocol):
    def run(self, audio_path: Path, original_file_name: str, job_id: str) -> JobResult:
        ...
