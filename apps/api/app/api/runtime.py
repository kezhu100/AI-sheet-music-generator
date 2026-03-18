from __future__ import annotations

from fastapi import APIRouter

from app.models.schemas import RuntimeDiagnostics
from app.services.runtime_diagnostics import runtime_diagnostics_service

router = APIRouter(tags=["runtime"])


@router.get("/runtime", response_model=RuntimeDiagnostics)
async def get_runtime_diagnostics() -> RuntimeDiagnostics:
    return runtime_diagnostics_service.collect().diagnostics
