from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, File, HTTPException, UploadFile, status

from app.models.schemas import (
    ExportProjectRequest,
    OpenLocalProjectRequest,
    ProjectDeleteResponse,
    ProjectDetailResponse,
    ProjectDuplicateRequest,
    ProjectListResponse,
    ProjectPackagingResponse,
    ProjectRenameRequest,
    ProjectRerunRequest,
)
from app.services.project_packaging import ProjectPackagingError, project_packaging_service
from app.services.project_store import project_store
from app.services.job_runner import start_job
from app.services.job_store import job_store

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("", response_model=ProjectListResponse)
async def list_projects() -> ProjectListResponse:
    return ProjectListResponse(projects=project_store.list_projects())


@router.get("/{project_id}", response_model=ProjectDetailResponse)
async def get_project(project_id: str) -> ProjectDetailResponse:
    project = project_store.get_project_detail(project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")
    return ProjectDetailResponse(project=project)


@router.post("/open-local", response_model=ProjectPackagingResponse)
async def open_local_project(payload: OpenLocalProjectRequest) -> ProjectPackagingResponse:
    try:
        project, package_metadata = project_packaging_service.open_local_project(payload.path)
    except ProjectPackagingError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    return ProjectPackagingResponse(project=project, packageMetadata=package_metadata)


@router.post("/import", response_model=ProjectPackagingResponse, status_code=status.HTTP_201_CREATED)
async def import_project(projectPackage: UploadFile = File(...)) -> ProjectPackagingResponse:
    try:
        project, package_metadata = await project_packaging_service.import_project_package_upload(projectPackage)
    except ProjectPackagingError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    return ProjectPackagingResponse(project=project, packageMetadata=package_metadata)


@router.patch("/{project_id}", response_model=ProjectDetailResponse)
async def rename_project(project_id: str, payload: ProjectRenameRequest) -> ProjectDetailResponse:
    project = project_store.rename_project(project_id, payload.project_name)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")
    return ProjectDetailResponse(project=project)


@router.post("/{project_id}/duplicate", response_model=ProjectDetailResponse, status_code=status.HTTP_201_CREATED)
async def duplicate_project(project_id: str, payload: Optional[ProjectDuplicateRequest] = None) -> ProjectDetailResponse:
    project = project_store.duplicate_project(project_id, payload.project_name if payload is not None else None)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")
    return ProjectDetailResponse(project=project)


@router.post("/{project_id}/rerun", response_model=ProjectDetailResponse)
async def rerun_project(project_id: str, payload: Optional[ProjectRerunRequest] = None) -> ProjectDetailResponse:
    project = project_store.get_project_detail(project_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")
    if project.upload is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Project reprocessing requires the original uploaded audio to still be available.",
        )

    provider_preferences = (
        payload.provider_preferences
        if payload is not None and payload.provider_preferences is not None
        else project.provider_preferences
    )
    processing_preferences = (
        payload.processing_preferences
        if payload is not None and payload.processing_preferences is not None
        else project.processing_preferences
    )
    queued_job = job_store.create(
        project.upload.upload_id,
        provider_preferences,
        processing_preferences,
        job_id=project_id,
    )
    refreshed_project = project_store.begin_reprocessing(
        project_id,
        provider_preferences=provider_preferences,
        processing_preferences=processing_preferences,
        progress=queued_job.progress,
    )
    if refreshed_project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")
    start_job(
        project_id,
        project.upload,
        provider_preferences,
        processing_preferences,
        replace_existing_result=True,
    )
    return ProjectDetailResponse(project=refreshed_project)


@router.post("/{project_id}/export", response_model=ProjectPackagingResponse)
async def export_project(project_id: str, payload: ExportProjectRequest) -> ProjectPackagingResponse:
    try:
        project, package_metadata, saved_path = project_packaging_service.export_project_to_path(project_id, payload.target_path)
    except ProjectPackagingError as exc:
        if str(exc) == "Project not found.":
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    return ProjectPackagingResponse(project=project, packageMetadata=package_metadata, savedPath=saved_path)


@router.delete("/{project_id}", response_model=ProjectDeleteResponse)
async def delete_project(project_id: str) -> ProjectDeleteResponse:
    if not project_store.delete_project(project_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")
    return ProjectDeleteResponse()
