from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.models.schemas import ProjectDetailResponse, ProjectListResponse
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
