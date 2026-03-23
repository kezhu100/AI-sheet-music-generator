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
RuntimeSeverity = Literal["ready", "degraded", "blocking"]
RuntimeCheckStatus = Literal["ready", "optional-missing", "degraded-fallback", "blocking-misconfigured"]
ProviderCategory = Literal["source-separation", "piano-transcription", "drum-transcription"]
ProviderLayer = Literal["built_in_base", "official_enhanced", "custom"]
ProviderInstallActionStatus = Literal["started", "completed", "failed"]
ProviderInstallState = Literal["started", "running", "completed", "failed"]
CustomProviderInstallSourceType = Literal["manifest_url"]
CustomProviderSourceTransport = Literal["file"]
SourceSeparationProviderPreference = Literal["auto", "development-copy", "demucs"]
PianoTranscriptionProviderPreference = Literal["auto", "heuristic", "basic-pitch"]
DrumTranscriptionProviderPreference = Literal["auto", "heuristic", "demucs-drums"]
PianoPostProcessingPreset = Literal["low", "medium", "high", "custom"]
PianoPostProcessingBasePreset = Literal["low", "medium", "high"]
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


class ProviderPreferences(BaseModel):
    source_separation: Optional[SourceSeparationProviderPreference] = Field(default=None, alias="sourceSeparation")
    piano_transcription: Optional[PianoTranscriptionProviderPreference] = Field(default=None, alias="pianoTranscription")
    drum_transcription: Optional[DrumTranscriptionProviderPreference] = Field(default=None, alias="drumTranscription")

    model_config = {"populate_by_name": True, "extra": "forbid"}


class PianoFilterSettings(BaseModel):
    enabled: bool = True
    low_cut_hz: float = Field(default=45.0, alias="lowCutHz")
    high_cut_hz: float = Field(default=7200.0, alias="highCutHz")
    cleanup_strength: float = Field(default=0.42, alias="cleanupStrength")

    model_config = {"populate_by_name": True, "extra": "forbid"}

    @field_validator("low_cut_hz")
    @classmethod
    def validate_low_cut_hz(cls, value: float) -> float:
        if value < 20 or value > 220:
            raise ValueError("lowCutHz must stay between 20 and 220 Hz.")
        return value

    @field_validator("high_cut_hz")
    @classmethod
    def validate_high_cut_hz(cls, value: float) -> float:
        if value < 1500 or value > 12000:
            raise ValueError("highCutHz must stay between 1500 and 12000 Hz.")
        return value

    @field_validator("cleanup_strength")
    @classmethod
    def validate_cleanup_strength(cls, value: float) -> float:
        if value < 0 or value > 1:
            raise ValueError("cleanupStrength must stay between 0 and 1.")
        return value

    @model_validator(mode="after")
    def validate_cutoff_order(self) -> "PianoFilterSettings":
        if self.high_cut_hz <= self.low_cut_hz:
            raise ValueError("highCutHz must be greater than lowCutHz.")
        return self


class PianoPostProcessingSettings(BaseModel):
    enabled: bool = True
    preset: PianoPostProcessingPreset = "medium"
    base_preset: PianoPostProcessingBasePreset = Field(default="medium", alias="basePreset")
    isolated_weak_note_threshold: float = Field(default=0.58, alias="isolatedWeakNoteThreshold")
    duplicate_merge_tolerance_ms: int = Field(default=80, alias="duplicateMergeToleranceMs")
    overlap_trim_aggressiveness: float = Field(default=0.75, alias="overlapTrimAggressiveness")
    extreme_note_filtering: bool = Field(default=True, alias="extremeNoteFiltering")
    confidence_threshold: float = Field(default=0.35, alias="confidenceThreshold")

    model_config = {"populate_by_name": True, "extra": "forbid"}

    @field_validator("isolated_weak_note_threshold", "confidence_threshold")
    @classmethod
    def validate_thresholds(cls, value: float) -> float:
        if value < 0 or value > 1:
            raise ValueError("Post-processing thresholds must stay between 0 and 1.")
        return value

    @field_validator("duplicate_merge_tolerance_ms")
    @classmethod
    def validate_duplicate_merge_tolerance_ms(cls, value: int) -> int:
        if value < 10 or value > 200:
            raise ValueError("duplicateMergeToleranceMs must stay between 10 and 200.")
        return value

    @field_validator("overlap_trim_aggressiveness")
    @classmethod
    def validate_overlap_trim_aggressiveness(cls, value: float) -> float:
        if value < 0 or value > 1:
            raise ValueError("overlapTrimAggressiveness must stay between 0 and 1.")
        return value

    @model_validator(mode="after")
    def normalize_base_preset(self) -> "PianoPostProcessingSettings":
        if self.preset != "custom":
            self.base_preset = self.preset
        return self


class ProcessingPreferences(BaseModel):
    piano_filter: PianoFilterSettings = Field(default_factory=PianoFilterSettings, alias="pianoFilter")
    piano_post_processing: PianoPostProcessingSettings = Field(
        default_factory=PianoPostProcessingSettings,
        alias="pianoPostProcessing",
    )

    model_config = {"populate_by_name": True, "extra": "forbid"}


class CreateJobRequest(BaseModel):
    upload_id: str = Field(alias="uploadId")
    provider_preferences: Optional[ProviderPreferences] = Field(default=None, alias="providerPreferences")
    processing_preferences: Optional[ProcessingPreferences] = Field(default=None, alias="processingPreferences")

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
    provider_preferences: Optional[ProviderPreferences] = Field(default=None, alias="providerPreferences")
    processing_preferences: Optional[ProcessingPreferences] = Field(default=None, alias="processingPreferences")
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
    provider_preferences: Optional[ProviderPreferences] = Field(default=None, alias="providerPreferences")
    processing_preferences: Optional[ProcessingPreferences] = Field(default=None, alias="processingPreferences")
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


class ProjectRerunRequest(BaseModel):
    provider_preferences: Optional[ProviderPreferences] = Field(default=None, alias="providerPreferences")
    processing_preferences: Optional[ProcessingPreferences] = Field(default=None, alias="processingPreferences")

    model_config = {"populate_by_name": True, "extra": "forbid"}


class ProjectPackagingResponse(BaseModel):
    status: Literal["ok"] = "ok"
    project: ProjectDetail
    package_metadata: Optional[ProjectPackageMetadata] = Field(default=None, alias="packageMetadata")
    target_path: Optional[str] = Field(default=None, alias="targetPath")
    saved_path: Optional[str] = Field(default=None, alias="savedPath")

    model_config = {"populate_by_name": True, "extra": "forbid"}


class RuntimeStorageStatus(BaseModel):
    key: str
    label: str
    path: str
    ready: bool
    message: str

    model_config = {"populate_by_name": True, "extra": "forbid"}


class RuntimeProviderOption(BaseModel):
    id: str
    category: ProviderCategory
    display_name: str = Field(alias="displayName")
    provider_layer: ProviderLayer = Field(alias="providerLayer")
    built_in: bool = Field(alias="builtIn")
    optional_enhanced: bool = Field(alias="optionalEnhanced")
    provider: str
    label: str
    installed: bool
    available: bool
    installable: bool
    recommended: bool
    missing_reason: Optional[str] = Field(default=None, alias="missingReason")
    help_text: str = Field(alias="helpText")
    status_text: str = Field(alias="statusText")
    actionable_steps: List[str] = Field(default_factory=list, alias="actionableSteps")
    detail: str

    model_config = {"populate_by_name": True, "extra": "forbid"}


class RuntimeCustomProvider(BaseModel):
    provider_id: str = Field(alias="providerId")
    category: ProviderCategory
    display_name: str = Field(alias="displayName")
    provider_layer: ProviderLayer = Field(alias="providerLayer")
    source_type: CustomProviderInstallSourceType = Field(alias="sourceType")
    source_transport: CustomProviderSourceTransport = Field(alias="sourceTransport")
    provider_version: str = Field(alias="providerVersion")
    manifest_url: str = Field(alias="manifestUrl")
    manifest_path: str = Field(alias="manifestPath")
    installed: bool
    available: bool
    asset_count: int = Field(alias="assetCount")
    status_text: str = Field(alias="statusText")
    detail: str

    model_config = {"populate_by_name": True, "extra": "forbid"}


class RuntimeProviderStatus(BaseModel):
    key: str
    label: str
    selected_provider: str = Field(alias="selectedProvider")
    selected_provider_label: str = Field(alias="selectedProviderLabel")
    fallback_provider: Optional[str] = Field(default=None, alias="fallbackProvider")
    fallback_provider_label: Optional[str] = Field(default=None, alias="fallbackProviderLabel")
    status: RuntimeCheckStatus
    message: str
    guidance: List[str]
    optional: bool
    options: List[RuntimeProviderOption]
    custom_providers: List[RuntimeCustomProvider] = Field(default_factory=list, alias="customProviders")

    model_config = {"populate_by_name": True, "extra": "forbid"}


class RuntimeDiagnostics(BaseModel):
    status: Literal["ok"] = "ok"
    severity: RuntimeSeverity
    ready: bool
    summary: str
    storage: List[RuntimeStorageStatus]
    providers: List[RuntimeProviderStatus]
    constraints: List[str]

    model_config = {"populate_by_name": True, "extra": "forbid"}


class ProviderInstallRequest(BaseModel):
    forceReinstall: bool = False

    model_config = {"extra": "forbid"}


class CustomProviderInstallRequest(BaseModel):
    source_type: CustomProviderInstallSourceType = Field(alias="sourceType")
    manifest_url: str = Field(alias="manifestUrl")
    force_reinstall: bool = Field(default=False, alias="forceReinstall")

    model_config = {"populate_by_name": True, "extra": "forbid"}

    @field_validator("manifest_url")
    @classmethod
    def validate_manifest_url(cls, value: str) -> str:
        trimmed = value.strip()
        if not trimmed:
            raise ValueError("manifestUrl must not be empty.")
        return trimmed


class ProviderInstallActionResponse(BaseModel):
    status: ProviderInstallActionStatus
    provider_id: str = Field(alias="providerId")
    category: Optional[ProviderCategory] = None
    install_id: Optional[str] = Field(default=None, alias="installId")
    message: str
    failure_reason: Optional[str] = Field(default=None, alias="failureReason")
    actionable_steps: List[str] = Field(default_factory=list, alias="actionableSteps")

    model_config = {"populate_by_name": True, "extra": "forbid"}


class ProviderInstallRecord(BaseModel):
    install_id: str = Field(alias="installId")
    provider_id: str = Field(alias="providerId")
    category: ProviderCategory
    provider_layer: ProviderLayer = Field(alias="providerLayer")
    state: ProviderInstallState
    started_at: datetime = Field(alias="startedAt")
    updated_at: datetime = Field(alias="updatedAt")
    completed_at: Optional[datetime] = Field(default=None, alias="completedAt")
    message: str
    failure_reason: Optional[str] = Field(default=None, alias="failureReason")
    actionable_steps: List[str] = Field(default_factory=list, alias="actionableSteps")
    log_path: Optional[str] = Field(default=None, alias="logPath")

    model_config = {"populate_by_name": True, "extra": "forbid"}


class ProviderInstallStatusResponse(BaseModel):
    status: Literal["ok"] = "ok"
    install: ProviderInstallRecord

    model_config = {"populate_by_name": True, "extra": "forbid"}


class CustomProviderInstallActionResponse(BaseModel):
    status: ProviderInstallActionStatus
    provider_id: Optional[str] = Field(default=None, alias="providerId")
    category: Optional[ProviderCategory] = None
    install_id: Optional[str] = Field(default=None, alias="installId")
    message: str
    failure_reason: Optional[str] = Field(default=None, alias="failureReason")
    actionable_steps: List[str] = Field(default_factory=list, alias="actionableSteps")

    model_config = {"populate_by_name": True, "extra": "forbid"}
