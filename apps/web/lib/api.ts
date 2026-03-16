import type { CreateJobRequest, JobResponse, UploadResponse } from "@ai-sheet-music-generator/shared-types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

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

export async function downloadMidiExport(jobId: string): Promise<Blob> {
  return downloadExportBlob(`/api/v1/jobs/${jobId}/exports/midi`);
}

export async function downloadMusicXmlExport(jobId: string): Promise<Blob> {
  return downloadExportBlob(`/api/v1/jobs/${jobId}/exports/musicxml`);
}

async function downloadExportBlob(path: string): Promise<Blob> {
  const response = await fetch(`${API_BASE_URL}${path}`, { method: "GET" });

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
