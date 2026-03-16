from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.models.schemas import CreateJobRequest, JobResponse
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

