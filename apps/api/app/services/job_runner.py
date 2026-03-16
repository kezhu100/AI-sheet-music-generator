from __future__ import annotations

from threading import Thread
from time import sleep

from app.models.schemas import UploadedFileDescriptor
from app.pipeline.development_pipeline import build_development_pipeline
from app.services.job_store import job_store
from app.services.storage import resolve_upload_path


def start_job(job_id: str, upload: UploadedFileDescriptor) -> None:
    thread = Thread(target=_run_job, args=(job_id, upload), daemon=True)
    thread.start()


def _run_job(job_id: str, upload: UploadedFileDescriptor) -> None:
    try:
        job_store.update_progress(
            job_id,
            status="processing",
            stage="normalizing",
            percent=15,
            message="Preparing uploaded audio for pipeline execution.",
        )
        sleep(0.6)

        job_store.update_progress(
            job_id,
            status="processing",
            stage="source_separation",
            percent=45,
            message="Routing audio through the separation provider interface.",
        )
        sleep(0.6)

        job_store.update_progress(
            job_id,
            status="processing",
            stage="transcription",
            percent=75,
            message="Running heuristic piano and drum transcription on the persisted stems.",
        )
        sleep(0.6)

        job_store.update_progress(
            job_id,
            status="processing",
            stage="post_processing",
            percent=90,
            message="Estimating tempo, quantizing events, aligning beats and bars, and filtering low-confidence notes.",
        )
        sleep(0.4)

        pipeline = build_development_pipeline()
        result = pipeline.run(resolve_upload_path(upload.stored_path), upload.file_name, job_id)
        job_store.complete(job_id, result)
    except Exception as exc:
        job_store.fail(job_id, str(exc))
