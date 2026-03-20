from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.models.schemas import (
    CustomProviderInstallActionResponse,
    CustomProviderInstallRequest,
    ProviderInstallActionResponse,
    ProviderInstallRequest,
    ProviderInstallStatusResponse,
    RuntimeDiagnostics,
)
from app.services.provider_installation import provider_installation_service
from app.services.runtime_diagnostics import runtime_diagnostics_service

router = APIRouter(tags=["runtime"])


@router.get("/runtime", response_model=RuntimeDiagnostics)
async def get_runtime_diagnostics() -> RuntimeDiagnostics:
    return runtime_diagnostics_service.collect().diagnostics


@router.post("/runtime/providers/custom/install", response_model=CustomProviderInstallActionResponse)
async def install_custom_provider(payload: CustomProviderInstallRequest) -> CustomProviderInstallActionResponse:
    return provider_installation_service.start_custom_install(payload)


@router.post("/runtime/providers/{provider_id}/install", response_model=ProviderInstallActionResponse)
async def install_provider(provider_id: str, payload: ProviderInstallRequest) -> ProviderInstallActionResponse:
    return provider_installation_service.start_install(provider_id, payload.forceReinstall)


@router.get("/runtime/providers/install/{install_id}", response_model=ProviderInstallStatusResponse)
async def get_provider_install_status(install_id: str) -> ProviderInstallStatusResponse:
    install = provider_installation_service.get_install(install_id)
    if install is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Install task not found.")
    return ProviderInstallStatusResponse(install=install)
