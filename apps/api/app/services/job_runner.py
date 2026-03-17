from __future__ import annotations

from threading import Thread
from time import sleep

from app.core.config import get_settings
from app.models.schemas import UploadedFileDescriptor
from app.pipeline.development_pipeline import build_processing_pipeline
from app.services.job_store import job_store
from app.services.project_store import project_store
from app.services.storage import resolve_upload_path


def start_job(job_id: str, upload: UploadedFileDescriptor) -> None:
    thread = Thread(target=_run_job, args=(job_id, upload), daemon=True)
    thread.start()


def _run_job(job_id: str, upload: UploadedFileDescriptor) -> None:
    try:
        settings = get_settings()
        job_store.update_progress(
            job_id,
            status="processing",
            stage="normalizing",
            percent=15,
            message="Preparing uploaded audio for pipeline execution.",
        )
        job = job_store.get(job_id)
        if job is not None:
            project_store.sync_job(job)
        sleep(0.6)

        job_store.update_progress(
            job_id,
            status="processing",
            stage="source_separation",
            percent=45,
            message=f"Routing audio through the configured source separation provider ({settings.source_separation_provider}).",
        )
        job = job_store.get(job_id)
        if job is not None:
            project_store.sync_job(job)
        sleep(0.6)

        job_store.update_progress(
            job_id,
            status="processing",
            stage="transcription",
            percent=75,
            message=(
                f"Running configured piano transcription ({settings.piano_transcription_provider}) "
                f"and configured drum transcription ({settings.drum_transcription_provider}) on the persisted stems."
            ),
        )
        job = job_store.get(job_id)
        if job is not None:
            project_store.sync_job(job)
        sleep(0.6)

        job_store.update_progress(
            job_id,
            status="processing",
            stage="post_processing",
            percent=90,
            message="Cleaning events, estimating a stable project tempo, quantizing timing, aligning beats and bars, and merging normalized tracks.",
        )
        job = job_store.get(job_id)
        if job is not None:
            project_store.sync_job(job)
        sleep(0.4)

        pipeline = build_processing_pipeline(settings)
        result = pipeline.run(resolve_upload_path(upload.stored_path), upload.file_name, job_id)
        completed_job = job_store.complete(job_id, result)
        project_store.mark_completed(completed_job, result)
    except Exception as exc:
        failed_job = job_store.fail(job_id, str(exc))
        project_store.mark_failed(failed_job)
