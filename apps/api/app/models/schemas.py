from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated, List, Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator


InstrumentType = Literal["piano", "drums", "bass", "other"]
JobStatus = Literal["queued", "processing", "failed", "completed"]
MIN_NOTE_DURATION_SEC = 0.05
MIN_MIDI_NOTE = 0
MAX_MIDI_NOTE = 127
MIN_DRUM_MIDI_NOTE = 35
MAX_DRUM_MIDI_NOTE = 81


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class UploadedFileDescriptor(BaseModel):
    upload_id: str = Field(alias="uploadId")
    file_name: str = Field(alias="fileName")
    content_type: str = Field(alias="contentType")
    size_bytes: int = Field(alias="sizeBytes")
    stored_path: str = Field(alias="storedPath")
    created_at: datetime = Field(alias="createdAt")

    model_config = {"populate_by_name": True, "extra": "forbid"}


class UploadResponse(BaseModel):
    status: Literal["ok"] = "ok"
    upload: UploadedFileDescriptor


class CreateJobRequest(BaseModel):
    upload_id: str = Field(alias="uploadId")

    model_config = {"populate_by_name": True, "extra": "forbid"}


class NoteEvent(BaseModel):
    id: str
    draft_note_id: Optional[str] = Field(default=None, alias="draftNoteId")
    instrument: InstrumentType
    pitch: Optional[int] = None
    drum_label: Optional[str] = Field(default=None, alias="drumLabel")
    midi_note: Optional[int] = Field(default=None, alias="midiNote")
    onset_sec: float = Field(alias="onsetSec")
    offset_sec: Optional[float] = Field(default=None, alias="offsetSec")
    velocity: Optional[int] = None
    confidence: Optional[float] = None
    channel: Optional[int] = None
    bar: Optional[int] = None
    beat: Optional[float] = None
    source_stem: Optional[str] = Field(default=None, alias="sourceStem")

    model_config = {"populate_by_name": True, "extra": "forbid"}

    @field_validator("id")
    @classmethod
    def validate_id(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Note id must not be empty.")
        return value

    @field_validator("draft_note_id")
    @classmethod
    def validate_draft_note_id(cls, value: Optional[str]) -> Optional[str]:
        if value is not None and not value.strip():
            raise ValueError("draftNoteId must not be empty when provided.")
        return value

    @field_validator("pitch")
    @classmethod
    def validate_pitch(cls, value: Optional[int]) -> Optional[int]:
        if value is None:
            return value
        if value < MIN_MIDI_NOTE or value > MAX_MIDI_NOTE:
            raise ValueError("Piano pitch must be between 0 and 127.")
        return value

    @field_validator("midi_note")
    @classmethod
    def validate_midi_note(cls, value: Optional[int]) -> Optional[int]:
        if value is None:
            return value
        if value < MIN_DRUM_MIDI_NOTE or value > MAX_DRUM_MIDI_NOTE:
            raise ValueError("Drum midiNote must be between 35 and 81.")
        return value

    @field_validator("onset_sec")
    @classmethod
    def validate_onset_sec(cls, value: float) -> float:
        if value < 0:
            raise ValueError("onsetSec must be greater than or equal to 0.")
        return value

    @field_validator("offset_sec")
    @classmethod
    def validate_offset_sec(cls, value: Optional[float]) -> Optional[float]:
        if value is not None and value < 0:
            raise ValueError("offsetSec must be greater than or equal to 0.")
        return value

    @model_validator(mode="after")
    def validate_note_shape(self) -> "NoteEvent":
        if self.instrument == "piano" and self.pitch is None:
            raise ValueError("Piano notes must include a valid pitch.")

        if self.instrument == "drums" and self.midi_note is None:
            raise ValueError("Drum notes must include a valid midiNote.")

        if self.offset_sec is not None:
            duration = self.offset_sec - self.onset_sec
            if duration < MIN_NOTE_DURATION_SEC:
                raise ValueError(f"Note duration must be at least {MIN_NOTE_DURATION_SEC} seconds.")

        return self


class StemAsset(BaseModel):
    stem_name: str = Field(alias="stemName")
    instrument_hint: str = Field(alias="instrumentHint")
    provider: str
    stored_path: str = Field(alias="storedPath")
    file_name: str = Field(alias="fileName")
    file_format: str = Field(alias="fileFormat")
    size_bytes: int = Field(alias="sizeBytes")

    model_config = {"populate_by_name": True, "extra": "forbid"}


class TrackResult(BaseModel):
    instrument: InstrumentType
    source_stem: str = Field(alias="sourceStem")
    provider: str
    event_count: int = Field(alias="eventCount")
    notes: list[NoteEvent]

    model_config = {"populate_by_name": True, "extra": "forbid"}

    @field_validator("source_stem", "provider")
    @classmethod
    def validate_non_empty_text(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Track fields must not be empty.")
        return value

    @model_validator(mode="after")
    def validate_track_shape(self) -> "TrackResult":
        if self.event_count != len(self.notes):
            raise ValueError("Track eventCount must match the number of notes.")

        for note in self.notes:
            if note.instrument != self.instrument:
                raise ValueError("Every note instrument must match its containing track instrument.")

        return self


class JobResult(BaseModel):
    project_name: str = Field(alias="projectName")
    bpm: int
    stems: List[StemAsset]
    tracks: List[TrackResult]
    warnings: List[str]

    model_config = {"populate_by_name": True, "extra": "forbid"}

    @field_validator("project_name")
    @classmethod
    def validate_project_name(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("projectName must not be empty.")
        return value

    @field_validator("bpm")
    @classmethod
    def validate_bpm(cls, value: int) -> int:
        if value <= 0:
            raise ValueError("bpm must be greater than 0.")
        return value

    @model_validator(mode="after")
    def validate_result_shape(self) -> "JobResult":
        if not self.tracks:
            raise ValueError("JobResult must include at least one track.")
        return self


class JobExportRequest(BaseModel):
    result_override: Annotated[Optional[JobResult], Field(alias="resultOverride")] = None

    model_config = {"populate_by_name": True, "extra": "forbid"}


class JobProgress(BaseModel):
    stage: str
    percent: int
    message: str


class JobRecord(BaseModel):
    id: str
    upload_id: str = Field(alias="uploadId")
    status: JobStatus
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")
    progress: JobProgress
    result: Optional[JobResult] = None
    error: Optional[str] = None

    model_config = {"populate_by_name": True}


class JobResponse(BaseModel):
    status: Literal["ok"] = "ok"
    job: JobRecord
