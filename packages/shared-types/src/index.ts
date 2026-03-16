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
