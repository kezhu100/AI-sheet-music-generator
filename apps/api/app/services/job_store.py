from __future__ import annotations

from threading import Lock
from typing import Optional
from uuid import uuid4

from app.models.schemas import JobProgress, JobRecord, JobResult, ProcessingPreferences, ProviderPreferences, utc_now


class JobStore:
    def __init__(self) -> None:
        self._jobs: dict[str, JobRecord] = {}
        self._lock = Lock()

    def create(
        self,
        upload_id: str,
        provider_preferences: ProviderPreferences | None = None,
        processing_preferences: ProcessingPreferences | None = None,
        *,
        job_id: str | None = None,
    ) -> JobRecord:
        now = utc_now()
        job = JobRecord(
            id=job_id or uuid4().hex,
            uploadId=upload_id,
            status="queued",
            createdAt=now,
            updatedAt=now,
            progress=JobProgress(stage="queued", percent=0, message="Job created and waiting for processing."),
            providerPreferences=provider_preferences,
            processingPreferences=processing_preferences,
        )
        with self._lock:
            self._jobs[job.id] = job
        return job

    def get(self, job_id: str) -> Optional[JobRecord]:
        with self._lock:
            return self._jobs.get(job_id)

    def update_progress(self, job_id: str, *, status: str, stage: str, percent: int, message: str) -> JobRecord:
        with self._lock:
            job = self._jobs[job_id]
            job.status = status  # type: ignore[assignment]
            job.progress = JobProgress(stage=stage, percent=percent, message=message)
            job.updated_at = utc_now()
            return job

    def complete(self, job_id: str, result: JobResult) -> JobRecord:
        with self._lock:
            job = self._jobs[job_id]
            job.status = "completed"
            job.progress = JobProgress(stage="completed", percent=100, message="Source separation complete.")
            job.result = result
            job.updated_at = utc_now()
            return job

    def fail(self, job_id: str, error: str) -> JobRecord:
        with self._lock:
            job = self._jobs[job_id]
            job.status = "failed"
            job.progress = JobProgress(stage="failed", percent=100, message="Job failed during processing.")
            job.error = error
            job.updated_at = utc_now()
            return job


job_store = JobStore()
