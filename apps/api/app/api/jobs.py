from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import Response
from pydantic import ValidationError

from app.models.schemas import CreateJobRequest, JobExportRequest, JobResponse, JobResult
from app.services.midi_export import MidiExportError, build_midi_file, build_midi_filename
from app.services.musicxml_export import MusicXmlExportError, build_musicxml_file, build_musicxml_filename
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
    result = _get_export_result(job_id)

    try:
        midi_bytes = build_midi_file(result)
    except MidiExportError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    filename = build_midi_filename(result.project_name)
    return Response(
        content=midi_bytes,
        media_type="audio/midi",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/{job_id}/exports/midi")
async def export_job_midi_override(job_id: str, payload: JobExportRequest) -> Response:
    result = _get_export_result(job_id, payload)

    try:
        midi_bytes = build_midi_file(result)
    except MidiExportError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    filename = build_midi_filename(result.project_name)
    return Response(
        content=midi_bytes,
        media_type="audio/midi",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{job_id}/exports/musicxml")
async def export_job_musicxml(job_id: str) -> Response:
    result = _get_export_result(job_id)

    try:
        musicxml_bytes = build_musicxml_file(result)
    except MusicXmlExportError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    filename = build_musicxml_filename(result.project_name)
    return Response(
        content=musicxml_bytes,
        media_type="application/vnd.recordare.musicxml+xml",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/{job_id}/exports/musicxml")
async def export_job_musicxml_override(job_id: str, payload: JobExportRequest) -> Response:
    result = _get_export_result(job_id, payload)

    try:
        musicxml_bytes = build_musicxml_file(result)
    except MusicXmlExportError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    filename = build_musicxml_filename(result.project_name)
    return Response(
        content=musicxml_bytes,
        media_type="application/vnd.recordare.musicxml+xml",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _get_export_result(job_id: str, payload: JobExportRequest | None = None) -> JobResult:
    job = job_store.get(job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found.")
    if payload is not None and payload.result_override is not None:
        try:
            return JobResult.model_validate(payload.result_override.model_dump(mode="python", by_alias=True))
        except ValidationError as exc:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    if job.result is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Job result is not available for export yet.")
    return job.result
