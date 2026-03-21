import type {
  AnalyzeDraftRequest,
  AnalyzeDraftResponse,
  CustomProviderInstallActionResponse,
  CustomProviderInstallRequest,
  CreateJobRequest,
  DuplicateProjectRequest,
  ExportProjectRequest,
  JobDraftResponse,
  ProjectDetailResponse,
  ProjectDeleteResponse,
  ProjectListResponse,
  ProjectPackagingResponse,
  ProjectRerunRequest,
  ProviderInstallActionResponse,
  ProviderInstallRequest,
  ProviderInstallStatusResponse,
  JobExportRequest,
  JobResponse,
  OpenLocalProjectRequest,
  RenameProjectRequest,
  JobResult,
  RuntimeDiagnosticsResponse,
  RegionRetranscriptionRequest,
  RegionRetranscriptionResponse,
  SaveJobDraftRequest,
  UploadResponse
} from "@ai-sheet-music-generator/shared-types";

function resolveApiBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_API_BASE_URL) {
    return process.env.NEXT_PUBLIC_API_BASE_URL;
  }

  if (typeof window !== "undefined") {
    const protocol = window.location.protocol === "https:" ? "https:" : "http:";
    const hostname = window.location.hostname === "localhost" ? "localhost" : "127.0.0.1";
    return `${protocol}//${hostname}:8000`;
  }

  return "http://127.0.0.1:8000";
}

const API_BASE_URL = resolveApiBaseUrl();
export type ExportScope = "combined" | "piano" | "drums";

export function getJobStemAssetUrl(jobId: string, stemName: string): string {
  return `${API_BASE_URL}/api/v1/jobs/${encodeURIComponent(jobId)}/stems/${encodeURIComponent(stemName)}`;
}

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;

    try {
      const body = (await response.json()) as { detail?: string };
      if (body.detail) {
        message = body.detail;
      }
    } catch {
      // Ignore JSON parsing issues to preserve the original fallback message.
    }

    throw new Error(message);
  }

  return (await response.json()) as T;
}

export async function uploadAudio(file: File): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE_URL}/api/v1/uploads`, {
    method: "POST",
    body: formData
  });

  return parseJson<UploadResponse>(response);
}

export async function createJob(payload: CreateJobRequest): Promise<JobResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/jobs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return parseJson<JobResponse>(response);
}

export async function getJob(jobId: string): Promise<JobResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/jobs/${jobId}`, {
    method: "GET",
    cache: "no-store"
  });

  return parseJson<JobResponse>(response);
}

export async function getProjects(): Promise<ProjectListResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/projects`, {
    method: "GET",
    cache: "no-store"
  });

  return parseJson<ProjectListResponse>(response);
}

export async function getProjectDetail(projectId: string): Promise<ProjectDetailResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}`, {
    method: "GET",
    cache: "no-store"
  });

  return parseJson<ProjectDetailResponse>(response);
}

export async function getRuntimeDiagnostics(): Promise<RuntimeDiagnosticsResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/runtime`, {
    method: "GET",
    cache: "no-store"
  });

  return parseJson<RuntimeDiagnosticsResponse>(response);
}

export async function installEnhancedProvider(
  providerId: string,
  payload: ProviderInstallRequest = {}
): Promise<ProviderInstallActionResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/runtime/providers/${providerId}/install`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return parseJson<ProviderInstallActionResponse>(response);
}

export async function getProviderInstallStatus(installId: string): Promise<ProviderInstallStatusResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/runtime/providers/install/${installId}`, {
    method: "GET",
    cache: "no-store"
  });

  return parseJson<ProviderInstallStatusResponse>(response);
}

export async function installCustomProvider(
  payload: CustomProviderInstallRequest
): Promise<CustomProviderInstallActionResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/runtime/providers/custom/install`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return parseJson<CustomProviderInstallActionResponse>(response);
}

export async function openLocalProject(path: string): Promise<ProjectPackagingResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/projects/open-local`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ path } satisfies OpenLocalProjectRequest)
  });

  return parseJson<ProjectPackagingResponse>(response);
}

export async function importProjectPackage(file: File): Promise<ProjectPackagingResponse> {
  const formData = new FormData();
  formData.append("projectPackage", file);

  const response = await fetch(`${API_BASE_URL}/api/v1/projects/import`, {
    method: "POST",
    body: formData
  });

  return parseJson<ProjectPackagingResponse>(response);
}

export async function renameProject(projectId: string, projectName: string): Promise<ProjectDetailResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ projectName } satisfies RenameProjectRequest)
  });

  return parseJson<ProjectDetailResponse>(response);
}

export async function duplicateProject(projectId: string, projectName?: string): Promise<ProjectDetailResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/duplicate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ projectName } satisfies DuplicateProjectRequest)
  });

  return parseJson<ProjectDetailResponse>(response);
}

export async function rerunProject(projectId: string, payload: ProjectRerunRequest): Promise<ProjectDetailResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/rerun`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return parseJson<ProjectDetailResponse>(response);
}

export async function exportProjectToPath(projectId: string, targetPath: string): Promise<ProjectPackagingResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/export`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ targetPath } satisfies ExportProjectRequest)
  });

  return parseJson<ProjectPackagingResponse>(response);
}

export async function deleteProject(projectId: string): Promise<ProjectDeleteResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}`, {
    method: "DELETE"
  });

  return parseJson<ProjectDeleteResponse>(response);
}

export async function getJobDraft(jobId: string): Promise<JobDraftResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/jobs/${jobId}/draft`, {
    method: "GET",
    cache: "no-store"
  });

  return parseJson<JobDraftResponse>(response);
}

export async function saveJobDraft(jobId: string, draftResult: JobResult): Promise<JobDraftResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/jobs/${jobId}/draft`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ draftResult } satisfies SaveJobDraftRequest)
  });

  return parseJson<JobDraftResponse>(response);
}

export async function retranscribeRegion(
  jobId: string,
  payload: RegionRetranscriptionRequest
): Promise<RegionRetranscriptionResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/jobs/${jobId}/retranscribe-region`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return parseJson<RegionRetranscriptionResponse>(response);
}

export async function analyzeDraft(jobId: string, draftResult: JobResult): Promise<AnalyzeDraftResponse> {
  const response = await fetch(`${API_BASE_URL}/api/v1/jobs/${jobId}/analyze-draft`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ draftResult } satisfies AnalyzeDraftRequest)
  });

  return parseJson<AnalyzeDraftResponse>(response);
}

export async function downloadMidiExport(
  jobId: string,
  scope: ExportScope = "combined",
  resultOverride?: JobResult
): Promise<Blob> {
  return downloadExportBlob(`/api/v1/jobs/${jobId}/exports/midi`, scope, resultOverride);
}

export async function downloadMusicXmlExport(
  jobId: string,
  scope: ExportScope = "combined",
  resultOverride?: JobResult
): Promise<Blob> {
  return downloadExportBlob(`/api/v1/jobs/${jobId}/exports/musicxml`, scope, resultOverride);
}

async function downloadExportBlob(path: string, scope: ExportScope, resultOverride?: JobResult): Promise<Blob> {
  const requestUrl = new URL(`${API_BASE_URL}${path}`);
  requestUrl.searchParams.set("scope", scope);

  const requestOptions: RequestInit =
    resultOverride == null
      ? { method: "GET" }
      : {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ resultOverride } satisfies JobExportRequest)
        };

  const response = await fetch(requestUrl.toString(), requestOptions);

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;

    try {
      const body = (await response.json()) as { detail?: string };
      if (body.detail) {
        message = body.detail;
      }
    } catch {
      // Ignore JSON parsing issues to preserve the original fallback message.
    }

    throw new Error(message);
  }

  return response.blob();
}
