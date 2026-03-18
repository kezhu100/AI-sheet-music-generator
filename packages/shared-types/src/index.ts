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
  result?: JobResult;
  error?: string;
}

export interface JobResponse {
  status: "ok";
  job: JobRecord;
}
