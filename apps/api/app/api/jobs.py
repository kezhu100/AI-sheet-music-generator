from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import Response

from app.models.schemas import CreateJobRequest, JobResponse
from app.services.midi_export import MidiExportError, build_midi_file, build_midi_filename
from app.services.job_runner import start_job
from app.services.job_store import job_store
from app.services.upload_registry import upload_registry

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.post("", response_model=JobResponse, status_code=status.HTTP_201_CREATED)
async def create_job(payload: CreateJobRequest) -> JobResponse:
    upload = upload_registry.get(payload.upload_id)
    if upload is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Upload not found.")

    job = job_store.create(payload.upload_id)
    start_job(job.id, upload)
    return JobResponse(job=job)


@router.get("/{job_id}", response_model=JobResponse)
async def get_job(job_id: str) -> JobResponse:
    job = job_store.get(job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found.")

    return JobResponse(job=job)


@router.get("/{job_id}/exports/midi")
async def export_job_midi(job_id: str) -> Response:
    job = job_store.get(job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found.")
    if job.result is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Job result is not available for export yet.")

    try:
        midi_bytes = build_midi_file(job.result)
    except MidiExportError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    filename = build_midi_filename(job.result.project_name)
    return Response(
        content=midi_bytes,
        media_type="audio/midi",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
