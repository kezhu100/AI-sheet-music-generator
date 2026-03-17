from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException, status

from app.models.schemas import (
    ProjectDeleteResponse,
    ProjectDetailResponse,
    ProjectDuplicateRequest,
    ProjectListResponse,
    ProjectRenameRequest,
)
from app.services.project_store import project_store

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


@router.delete("/{project_id}", response_model=ProjectDeleteResponse)
async def delete_project(project_id: str) -> ProjectDeleteResponse:
    if not project_store.delete_project(project_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")
    return ProjectDeleteResponse()
