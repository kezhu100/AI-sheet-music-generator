from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Literal, Optional

from pydantic import BaseModel, Field


InstrumentType = Literal["piano", "drums", "bass", "other"]
JobStatus = Literal["queued", "processing", "failed", "completed"]


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class UploadedFileDescriptor(BaseModel):
    upload_id: str = Field(alias="uploadId")
    file_name: str = Field(alias="fileName")
    content_type: str = Field(alias="contentType")
    size_bytes: int = Field(alias="sizeBytes")
    stored_path: str = Field(alias="storedPath")
    created_at: datetime = Field(alias="createdAt")

    model_config = {"populate_by_name": True}


class UploadResponse(BaseModel):
    status: Literal["ok"] = "ok"
    upload: UploadedFileDescriptor


class CreateJobRequest(BaseModel):
    upload_id: str = Field(alias="uploadId")

    model_config = {"populate_by_name": True}


class NoteEvent(BaseModel):
    id: str
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

    model_config = {"populate_by_name": True}


class StemAsset(BaseModel):
    stem_name: str = Field(alias="stemName")
    instrument_hint: str = Field(alias="instrumentHint")
    provider: str
    stored_path: str = Field(alias="storedPath")
    file_name: str = Field(alias="fileName")
    file_format: str = Field(alias="fileFormat")
    size_bytes: int = Field(alias="sizeBytes")

    model_config = {"populate_by_name": True}


class TrackResult(BaseModel):
    instrument: InstrumentType
    source_stem: str = Field(alias="sourceStem")
    provider: str
    event_count: int = Field(alias="eventCount")
    notes: list[NoteEvent]

    model_config = {"populate_by_name": True}


class JobResult(BaseModel):
    project_name: str = Field(alias="projectName")
    bpm: int
    stems: List[StemAsset]
    tracks: List[TrackResult]
    warnings: List[str]

    model_config = {"populate_by_name": True}


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
