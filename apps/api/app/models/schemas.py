from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated, List, Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator


InstrumentType = Literal["piano", "drums", "bass", "other"]
RetranscriptionInstrumentType = Literal["piano", "drums"]
CorrectionInstrumentType = Literal["piano", "drums"]
CorrectionSuggestionType = Literal["pitch", "timing", "velocity", "drum-pattern"]
JobStatus = Literal["queued", "processing", "failed", "completed"]
ExportFormat = Literal["midi", "musicxml"]
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
    result_override: Optional[JobResult] = Field(default=None, alias="resultOverride")

    model_config = {"populate_by_name": True, "extra": "forbid"}


class JobDraftRecord(BaseModel):
    job_id: str = Field(alias="jobId")
    version: int
    saved_at: datetime = Field(alias="savedAt")
    result: JobResult

    model_config = {"populate_by_name": True, "extra": "forbid"}

    @field_validator("job_id")
    @classmethod
    def validate_job_id(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("jobId must not be empty.")
        return value

    @field_validator("version")
    @classmethod
    def validate_version(cls, value: int) -> int:
        if value <= 0:
            raise ValueError("version must be greater than 0.")
        return value


class SaveJobDraftRequest(BaseModel):
    draft_result: JobResult = Field(..., alias="draftResult")

    model_config = {"populate_by_name": True, "extra": "forbid"}


class CorrectionSuggestedChange(BaseModel):
    pitch: Optional[int] = None
    onset_sec: Optional[float] = Field(default=None, alias="onsetSec")
    offset_sec: Optional[float] = Field(default=None, alias="offsetSec")
    velocity: Optional[int] = None
    drum_label: Optional[str] = Field(default=None, alias="drumLabel")
    midi_note: Optional[int] = Field(default=None, alias="midiNote")

    model_config = {"populate_by_name": True, "extra": "forbid"}

    @field_validator("pitch")
    @classmethod
    def validate_suggested_pitch(cls, value: Optional[int]) -> Optional[int]:
        return NoteEvent.validate_pitch(value)

    @field_validator("midi_note")
    @classmethod
    def validate_suggested_midi_note(cls, value: Optional[int]) -> Optional[int]:
        return NoteEvent.validate_midi_note(value)

    @field_validator("velocity")
    @classmethod
    def validate_velocity(cls, value: Optional[int]) -> Optional[int]:
        if value is None:
            return value
        if value < 1 or value > 127:
            raise ValueError("velocity must be between 1 and 127.")
        return value

    @field_validator("onset_sec", "offset_sec")
    @classmethod
    def validate_non_negative_timing(cls, value: Optional[float]) -> Optional[float]:
        if value is not None and value < 0:
            raise ValueError("Suggested timing values must be greater than or equal to 0.")
        return value


class CorrectionSuggestion(BaseModel):
    type: CorrectionSuggestionType
    instrument: CorrectionInstrumentType
    note_id: str = Field(alias="noteId")
    message: str
    suggested_change: CorrectionSuggestedChange = Field(alias="suggestedChange")

    model_config = {"populate_by_name": True, "extra": "forbid"}

    @field_validator("note_id", "message")
    @classmethod
    def validate_non_empty_text(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Suggestion text fields must not be empty.")
        return value


class AnalyzeDraftRequest(BaseModel):
    draft_result: JobResult = Field(..., alias="draftResult")

    model_config = {"populate_by_name": True, "extra": "forbid"}


class AnalyzeDraftResponse(BaseModel):
    status: Literal["ok"] = "ok"
    suggestions: List[CorrectionSuggestion]

    model_config = {"populate_by_name": True, "extra": "forbid"}


class RegionRetranscriptionRequest(BaseModel):
    instrument: RetranscriptionInstrumentType
    start_sec: Annotated[float, Field(alias="startSec")]
    end_sec: Annotated[float, Field(alias="endSec")]

    model_config = {"populate_by_name": True, "extra": "forbid"}

    @field_validator("start_sec", "end_sec")
    @classmethod
    def validate_non_negative_time(cls, value: float) -> float:
        if value < 0:
            raise ValueError("Region times must be greater than or equal to 0.")
        return value

    @model_validator(mode="after")
    def validate_time_range(self) -> "RegionRetranscriptionRequest":
        if self.end_sec <= self.start_sec:
            raise ValueError("endSec must be greater than startSec.")
        return self


class RegionRetranscriptionResponse(BaseModel):
    status: Literal["ok"] = "ok"
    instrument: RetranscriptionInstrumentType
    start_sec: Annotated[float, Field(alias="startSec")]
    end_sec: Annotated[float, Field(alias="endSec")]
    provider_used: str = Field(alias="providerUsed")
    notes: List[NoteEvent]

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


class JobDraftResponse(BaseModel):
    status: Literal["ok"] = "ok"
    draft: JobDraftRecord


class ProjectAssetAvailability(BaseModel):
    has_source_upload: bool = Field(alias="hasSourceUpload")
    has_stems: bool = Field(alias="hasStems")
    has_original_result: bool = Field(alias="hasOriginalResult")
    available_exports: List[ExportFormat] = Field(alias="availableExports")

    model_config = {"populate_by_name": True, "extra": "forbid"}


class ProjectSummary(BaseModel):
    project_id: str = Field(alias="projectId")
    job_id: str = Field(alias="jobId")
    project_name: str = Field(alias="projectName")
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime = Field(alias="updatedAt")
    status: JobStatus
    has_saved_draft: bool = Field(alias="hasSavedDraft")
    draft_version: Optional[int] = Field(default=None, alias="draftVersion")
    draft_saved_at: Optional[datetime] = Field(default=None, alias="draftSavedAt")
    assets: ProjectAssetAvailability
    share_path: str = Field(alias="sharePath")
    current_stage: Optional[str] = Field(default=None, alias="currentStage")
    status_message: Optional[str] = Field(default=None, alias="statusMessage")
    error: Optional[str] = None
    stem_count: Optional[int] = Field(default=None, alias="stemCount")
    track_count: Optional[int] = Field(default=None, alias="trackCount")

    model_config = {"populate_by_name": True, "extra": "forbid"}

    @field_validator("project_id", "job_id", "project_name", "share_path")
    @classmethod
    def validate_summary_text(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Project summary text fields must not be empty.")
        return value


class ProjectDetail(ProjectSummary):
    upload: Optional[UploadedFileDescriptor] = None
    original_result: Optional[JobResult] = Field(default=None, alias="originalResult")
    saved_draft: Optional[JobDraftRecord] = Field(default=None, alias="savedDraft")

    model_config = {"populate_by_name": True, "extra": "forbid"}


class ProjectPackageMetadata(BaseModel):
    format_version: int = Field(alias="formatVersion")
    source_project_id: str = Field(alias="sourceProjectId")
    source_job_id: str = Field(alias="sourceJobId")
    exported_at: datetime = Field(alias="exportedAt")
    includes_saved_draft: bool = Field(alias="includesSavedDraft")
    includes_source_upload: bool = Field(alias="includesSourceUpload")
    included_stem_count: int = Field(alias="includedStemCount")

    model_config = {"populate_by_name": True, "extra": "forbid"}


class OpenLocalProjectRequest(BaseModel):
    path: str

    model_config = {"populate_by_name": True, "extra": "forbid"}

    @field_validator("path")
    @classmethod
    def validate_path(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("path must not be empty.")
        return value.strip()


class ExportProjectRequest(BaseModel):
    target_path: str = Field(alias="targetPath")

    model_config = {"populate_by_name": True, "extra": "forbid"}

    @field_validator("target_path")
    @classmethod
    def validate_target_path(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("targetPath must not be empty.")
        return value.strip()


class ProjectManifestRecord(BaseModel):
    summary: ProjectSummary
    upload: Optional[UploadedFileDescriptor] = None
    current_stage: Optional[str] = Field(default=None, alias="currentStage")
    status_message: Optional[str] = Field(default=None, alias="statusMessage")
    error: Optional[str] = None
    draft_saved_at: Optional[datetime] = Field(default=None, alias="draftSavedAt")
    deleted_at: Optional[datetime] = Field(default=None, alias="deletedAt")

    model_config = {"populate_by_name": True, "extra": "forbid"}


class ProjectListResponse(BaseModel):
    status: Literal["ok"] = "ok"
    projects: List[ProjectSummary]

    model_config = {"populate_by_name": True, "extra": "forbid"}


class ProjectDetailResponse(BaseModel):
    status: Literal["ok"] = "ok"
    project: ProjectDetail

    model_config = {"populate_by_name": True, "extra": "forbid"}


class ProjectRenameRequest(BaseModel):
    project_name: str = Field(alias="projectName")

    model_config = {"populate_by_name": True, "extra": "forbid"}

    @field_validator("project_name")
    @classmethod
    def validate_project_name(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("projectName must not be empty.")
        return value.strip()


class ProjectDuplicateRequest(BaseModel):
    project_name: Optional[str] = Field(default=None, alias="projectName")

    model_config = {"populate_by_name": True, "extra": "forbid"}

    @field_validator("project_name")
    @classmethod
    def validate_optional_project_name(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("projectName must not be empty when provided.")
        return trimmed


class ProjectDeleteResponse(BaseModel):
    status: Literal["ok"] = "ok"

    model_config = {"populate_by_name": True, "extra": "forbid"}


class ProjectPackagingResponse(BaseModel):
    status: Literal["ok"] = "ok"
    project: ProjectDetail
    package_metadata: Optional[ProjectPackageMetadata] = Field(default=None, alias="packageMetadata")
    target_path: Optional[str] = Field(default=None, alias="targetPath")
    saved_path: Optional[str] = Field(default=None, alias="savedPath")

    model_config = {"populate_by_name": True, "extra": "forbid"}
