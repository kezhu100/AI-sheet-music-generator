from __future__ import annotations

from fastapi import APIRouter, File, HTTPException, UploadFile, status

from app.models.schemas import UploadResponse
from app.services.storage import UploadStorageError, UploadTooLargeError, save_upload
from app.services.upload_registry import upload_registry

router = APIRouter(prefix="/uploads", tags=["uploads"])

ALLOWED_AUDIO_PREFIXES = ("audio/",)


@router.post("", response_model=UploadResponse)
async def create_upload(file: UploadFile = File(...)) -> UploadResponse:
    if not file.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="A file name is required.")

    if file.content_type and not file.content_type.startswith(ALLOWED_AUDIO_PREFIXES):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only audio uploads are supported.")

    try:
        upload = await save_upload(file)
    except UploadTooLargeError as exc:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail=str(exc)) from exc
    except UploadStorageError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc

    upload_registry.add(upload)
    return UploadResponse(upload=upload)
