export type InstrumentType = "piano" | "drums" | "bass" | "other";

export type JobStatus = "queued" | "processing" | "failed" | "completed";

export interface UploadedFileDescriptor {
  uploadId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  storedPath: string;
  createdAt: string;
}

export interface UploadResponse {
  status: "ok";
  upload: UploadedFileDescriptor;
}

export interface CreateJobRequest {
  uploadId: string;
  providerPreferences?: ProviderPreferences;
  processingPreferences?: ProcessingPreferences;
}

export type SourceSeparationProviderPreference = "auto" | "development-copy" | "demucs";
export type PianoTranscriptionProviderPreference = "auto" | "heuristic" | "basic-pitch";
export type DrumTranscriptionProviderPreference = "auto" | "heuristic" | "demucs-drums";

export interface ProviderPreferences {
  sourceSeparation?: SourceSeparationProviderPreference;
  pianoTranscription?: PianoTranscriptionProviderPreference;
  drumTranscription?: DrumTranscriptionProviderPreference;
}

export interface PianoFilterSettings {
  enabled: boolean;
  lowCutHz: number;
  highCutHz: number;
  cleanupStrength: number;
}

export type PianoPostProcessingPreset = "low" | "medium" | "high" | "custom";
export type PianoPostProcessingBasePreset = "low" | "medium" | "high";

export interface PianoPostProcessingSettings {
  enabled: boolean;
  preset: PianoPostProcessingPreset;
  basePreset: PianoPostProcessingBasePreset;
  isolatedWeakNoteThreshold: number;
  duplicateMergeToleranceMs: number;
  overlapTrimAggressiveness: number;
  extremeNoteFiltering: boolean;
  confidenceThreshold: number;
}

export interface ProcessingPreferences {
  pianoFilter: PianoFilterSettings;
  pianoPostProcessing: PianoPostProcessingSettings;
}

export interface NoteEvent {
  id: string;
  draftNoteId?: string;
  instrument: InstrumentType;
  pitch?: number;
  drumLabel?: string;
  midiNote?: number;
  onsetSec: number;
  offsetSec?: number;
  velocity?: number;
  confidence?: number;
  channel?: number;
  bar?: number;
  beat?: number;
  sourceStem?: string;
}

export interface StemAsset {
  stemName: string;
  instrumentHint: string;
  provider: string;
  storedPath: string;
  fileName: string;
  fileFormat: string;
  sizeBytes: number;
}

export interface TrackResult {
  instrument: InstrumentType;
  sourceStem: string;
  provider: string;
  eventCount: number;
  notes: NoteEvent[];
}

export interface JobResult {
  projectName: string;
  bpm: number;
  stems: StemAsset[];
  tracks: TrackResult[];
  warnings: string[];
}

export interface JobExportRequest {
  resultOverride?: JobResult;
}

export interface JobDraftRecord {
  jobId: string;
  version: number;
  savedAt: string;
  result: JobResult;
}

export interface SaveJobDraftRequest {
  draftResult: JobResult;
}

export type CorrectionSuggestionType = "pitch" | "timing" | "velocity" | "drum-pattern";

export interface CorrectionSuggestedChange {
  pitch?: number;
  onsetSec?: number;
  offsetSec?: number;
  velocity?: number;
  drumLabel?: string;
  midiNote?: number;
}

export interface CorrectionSuggestion {
  type: CorrectionSuggestionType;
  instrument: "piano" | "drums";
  noteId: string;
  message: string;
  suggestedChange: CorrectionSuggestedChange;
}

export interface AnalyzeDraftRequest {
  draftResult: JobResult;
}

export interface AnalyzeDraftResponse {
  status: "ok";
  suggestions: CorrectionSuggestion[];
}

export interface RegionRetranscriptionRequest {
  instrument: "piano" | "drums";
  startSec: number;
  endSec: number;
}

export interface RegionRetranscriptionResponse {
  status: "ok";
  instrument: "piano" | "drums";
  startSec: number;
  endSec: number;
  providerUsed: string;
  notes: NoteEvent[];
}

export interface JobDraftResponse {
  status: "ok";
  draft: JobDraftRecord;
}

export type ExportFormat = "midi" | "musicxml";

export interface ProjectAssetAvailability {
  hasSourceUpload: boolean;
  hasStems: boolean;
  hasOriginalResult: boolean;
  availableExports: ExportFormat[];
}

export interface ProjectSummary {
  projectId: string;
  jobId: string;
  projectName: string;
  createdAt: string;
  updatedAt: string;
  status: JobStatus;
  hasSavedDraft: boolean;
  draftVersion?: number | null;
  draftSavedAt?: string | null;
  providerPreferences?: ProviderPreferences | null;
  processingPreferences?: ProcessingPreferences | null;
  assets: ProjectAssetAvailability;
  sharePath: string;
  currentStage?: string | null;
  statusMessage?: string | null;
  error?: string | null;
  stemCount?: number | null;
  trackCount?: number | null;
}

export interface ProjectDetail extends ProjectSummary {
  upload?: UploadedFileDescriptor | null;
  originalResult?: JobResult | null;
  savedDraft?: JobDraftRecord | null;
}

export interface ProjectPackageMetadata {
  formatVersion: number;
  sourceProjectId: string;
  sourceJobId: string;
  exportedAt: string;
  includesSavedDraft: boolean;
  includesSourceUpload: boolean;
  includedStemCount: number;
}

export interface ProjectListResponse {
  status: "ok";
  projects: ProjectSummary[];
}

export interface ProjectDetailResponse {
  status: "ok";
  project: ProjectDetail;
}

export interface RenameProjectRequest {
  projectName: string;
}

export interface DuplicateProjectRequest {
  projectName?: string;
}

export interface ProjectDeleteResponse {
  status: "ok";
}

export interface ProjectRerunRequest {
  providerPreferences?: ProviderPreferences | null;
  processingPreferences?: ProcessingPreferences | null;
}

export interface OpenLocalProjectRequest {
  path: string;
}

export interface ExportProjectRequest {
  targetPath: string;
}

export interface ProjectPackagingResponse {
  status: "ok";
  project: ProjectDetail;
  packageMetadata?: ProjectPackageMetadata | null;
  targetPath?: string | null;
  savedPath?: string | null;
}

export type RuntimeSeverity = "ready" | "degraded" | "blocking";
export type RuntimeCheckStatus = "ready" | "optional-missing" | "degraded-fallback" | "blocking-misconfigured";
export type ProviderCategory = "source-separation" | "piano-transcription" | "drum-transcription";
export type ProviderLayer = "built_in_base" | "official_enhanced" | "custom";
export type ProviderInstallActionStatus = "started" | "completed" | "failed";
export type ProviderInstallState = "started" | "running" | "completed" | "failed";
export type CustomProviderInstallSourceType = "manifest_url";
export type CustomProviderSourceTransport = "file";

export interface RuntimeStorageStatus {
  key: string;
  label: string;
  path: string;
  ready: boolean;
  message: string;
}

export interface RuntimeProviderStatus {
  key: string;
  label: string;
  selectedProvider: string;
  selectedProviderLabel: string;
  fallbackProvider?: string | null;
  fallbackProviderLabel?: string | null;
  status: RuntimeCheckStatus;
  message: string;
  guidance: string[];
  optional: boolean;
  options: RuntimeProviderOption[];
  customProviders: RuntimeCustomProvider[];
}

export interface RuntimeProviderOption {
  id: string;
  category: ProviderCategory;
  displayName: string;
  providerLayer: ProviderLayer;
  builtIn: boolean;
  optionalEnhanced: boolean;
  provider: string;
  label: string;
  installed: boolean;
  available: boolean;
  installable: boolean;
  recommended: boolean;
  missingReason?: string | null;
  helpText: string;
  statusText: string;
  actionableSteps: string[];
  detail: string;
}

export interface RuntimeCustomProvider {
  providerId: string;
  category: ProviderCategory;
  displayName: string;
  providerLayer: ProviderLayer;
  sourceType: CustomProviderInstallSourceType;
  sourceTransport: CustomProviderSourceTransport;
  providerVersion: string;
  manifestUrl: string;
  manifestPath: string;
  installed: boolean;
  available: boolean;
  assetCount: number;
  statusText: string;
  detail: string;
}

export interface RuntimeDiagnosticsResponse {
  status: "ok";
  severity: RuntimeSeverity;
  ready: boolean;
  summary: string;
  storage: RuntimeStorageStatus[];
  providers: RuntimeProviderStatus[];
  constraints: string[];
}

export interface ProviderInstallRequest {
  forceReinstall?: boolean;
}

export interface CustomProviderInstallRequest {
  sourceType: CustomProviderInstallSourceType;
  manifestUrl: string;
  forceReinstall?: boolean;
}

export interface ProviderInstallActionResponse {
  status: ProviderInstallActionStatus;
  providerId: string;
  category?: ProviderCategory | null;
  installId?: string | null;
  message: string;
  failureReason?: string | null;
  actionableSteps: string[];
}

export interface ProviderInstallRecord {
  installId: string;
  providerId: string;
  category: ProviderCategory;
  providerLayer: ProviderLayer;
  state: ProviderInstallState;
  startedAt: string;
  updatedAt: string;
  completedAt?: string | null;
  message: string;
  failureReason?: string | null;
  actionableSteps: string[];
  logPath?: string | null;
}

export interface ProviderInstallStatusResponse {
  status: "ok";
  install: ProviderInstallRecord;
}

export interface CustomProviderInstallActionResponse {
  status: ProviderInstallActionStatus;
  providerId?: string | null;
  category?: ProviderCategory | null;
  installId?: string | null;
  message: string;
  failureReason?: string | null;
  actionableSteps: string[];
}

export interface JobProgress {
  stage: string;
  percent: number;
  message: string;
}

export interface JobRecord {
  id: string;
  uploadId: string;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  progress: JobProgress;
  providerPreferences?: ProviderPreferences | null;
  processingPreferences?: ProcessingPreferences | null;
  result?: JobResult;
  error?: string;
}

export interface JobResponse {
  status: "ok";
  job: JobRecord;
}
