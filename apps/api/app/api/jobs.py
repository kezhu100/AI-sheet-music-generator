from __future__ import annotations

from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import Response
from pydantic import ValidationError

from app.models.schemas import (
    AnalyzeDraftRequest,
    AnalyzeDraftResponse,
    CreateJobRequest,
    JobDraftResponse,
    JobExportRequest,
    JobResponse,
    JobResult,
    RegionRetranscriptionRequest,
    RegionRetranscriptionResponse,
    SaveJobDraftRequest,
)
from app.services.correction_analysis import CorrectionAnalysisService
from app.services.draft_store import draft_store
from app.services.midi_export import MidiExportError, build_midi_file, build_midi_filename
from app.services.musicxml_export import MusicXmlExportError, build_musicxml_file, build_musicxml_filename
from app.services.region_retranscription import RegionRetranscriptionService
from app.services.job_runner import start_job
from app.services.job_store import job_store
from app.services.project_store import project_store
from app.services.upload_registry import upload_registry

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.post("", response_model=JobResponse, status_code=status.HTTP_201_CREATED)
async def create_job(payload: CreateJobRequest) -> JobResponse:
    upload = upload_registry.get(payload.upload_id)
    if upload is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Upload not found.")

    job = job_store.create(payload.upload_id)
    project_store.create_project(job, upload)
    start_job(job.id, upload, payload.provider_preferences)
    return JobResponse(job=job)


@router.get("/{job_id}", response_model=JobResponse)
async def get_job(job_id: str) -> JobResponse:
    job = job_store.get(job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found.")

    return JobResponse(job=job)


@router.get("/{job_id}/draft", response_model=JobDraftResponse)
async def get_job_draft(job_id: str) -> JobDraftResponse:
    _get_completed_job(job_id)
    draft = draft_store.get(job_id)
    if draft is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Draft not found.")

    return JobDraftResponse(draft=draft)


@router.put("/{job_id}/draft", response_model=JobDraftResponse)
async def save_job_draft(job_id: str, payload: SaveJobDraftRequest) -> JobDraftResponse:
    _get_completed_job(job_id)

    try:
        draft = draft_store.save(
            job_id,
            JobResult.model_validate(payload.draft_result.model_dump(mode="python", by_alias=True)),
        )
    except ValidationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    project_store.record_draft_saved(draft)
    return JobDraftResponse(draft=draft)


@router.post("/{job_id}/analyze-draft", response_model=AnalyzeDraftResponse)
async def analyze_job_draft(job_id: str, payload: AnalyzeDraftRequest) -> AnalyzeDraftResponse:
    _get_completed_job(job_id)

    try:
        draft_result = JobResult.model_validate(payload.draft_result.model_dump(mode="python", by_alias=True))
    except ValidationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    suggestions = CorrectionAnalysisService().analyze_draft(draft_result)
    return AnalyzeDraftResponse(suggestions=suggestions)


@router.post("/{job_id}/retranscribe-region", response_model=RegionRetranscriptionResponse)
async def retranscribe_job_region(job_id: str, payload: RegionRetranscriptionRequest) -> RegionRetranscriptionResponse:
    job = _get_completed_job(job_id)
    if job.result is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Job result is not available yet.")

    retranscription_result = RegionRetranscriptionService().retranscribe_region(
        job_id=job_id,
        result_stems=job.result.stems,
        request=payload,
    )
    return RegionRetranscriptionResponse(
        instrument=payload.instrument,
        startSec=payload.start_sec,
        endSec=payload.end_sec,
        providerUsed=retranscription_result.provider_used,
        notes=retranscription_result.notes,
    )


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
        headers={"Content-Disposition": _build_content_disposition(filename)},
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
        headers={"Content-Disposition": _build_content_disposition(filename)},
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
        headers={"Content-Disposition": _build_content_disposition(filename)},
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
        headers={"Content-Disposition": _build_content_disposition(filename)},
    )


def _get_export_result(job_id: str, payload: JobExportRequest | None = None) -> JobResult:
    job = _get_completed_job(job_id, allow_processing_result=True)
    if payload is not None and payload.result_override is not None:
        try:
            return JobResult.model_validate(payload.result_override.model_dump(mode="python", by_alias=True))
        except ValidationError as exc:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    if job.result is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Job result is not available for export yet.")
    return job.result


def _get_completed_job(job_id: str, *, allow_processing_result: bool = False):
    job = job_store.get(job_id)
    if job is None:
        job = project_store.get_completed_job_record(job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found.")
    if not allow_processing_result and (job.status != "completed" or job.result is None):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Job result is not available yet.")
    return job


def _build_content_disposition(filename: str) -> str:
    ascii_filename = _make_ascii_fallback_filename(filename)
    utf8_filename = quote(filename, safe="")
    return f'attachment; filename="{ascii_filename}"; filename*=UTF-8\'\'{utf8_filename}'


def _make_ascii_fallback_filename(filename: str) -> str:
    suffix = Path(filename).suffix
    stem = Path(filename).stem or "download"
    safe_stem = "".join(character if character.isascii() and character.isalnum() else "_" for character in stem).strip("_")
    if not safe_stem:
        safe_stem = "download"
    safe_suffix = "".join(character if character.isascii() and (character.isalnum() or character == ".") else "" for character in suffix)
    if safe_suffix and not safe_suffix.startswith("."):
        safe_suffix = f".{safe_suffix}"
    return f"{safe_stem}{safe_suffix or ''}"
