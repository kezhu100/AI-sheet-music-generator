from __future__ import annotations

from pathlib import Path
from shutil import copyfile
from uuid import uuid4

from fastapi import UploadFile

from app.core.config import get_settings
from app.models.schemas import StemAsset, UploadedFileDescriptor, utc_now


async def save_upload(file: UploadFile) -> UploadedFileDescriptor:
    settings = get_settings()
    upload_id = uuid4().hex
    target_name = f"{upload_id}_{file.filename or 'audio.bin'}"
    destination = settings.uploads_dir / target_name

    content = await file.read()
    destination.write_bytes(content)

    return UploadedFileDescriptor(
        uploadId=upload_id,
        fileName=file.filename or target_name,
        contentType=file.content_type or "application/octet-stream",
        sizeBytes=len(content),
        storedPath=str(destination.relative_to(settings.project_root)).replace("\\", "/"),
        createdAt=utc_now(),
    )


def resolve_upload_path(stored_path: str) -> Path:
    settings = get_settings()
    return settings.project_root / stored_path


def resolve_project_path(stored_path: str) -> Path:
    settings = get_settings()
    return settings.project_root / stored_path


def persist_stem_copy(*, source_path: Path, job_id: str, stem_name: str, instrument_hint: str, provider: str) -> StemAsset:
    settings = get_settings()
    stem_dir = settings.stems_dir / job_id
    stem_dir.mkdir(parents=True, exist_ok=True)

    suffix = source_path.suffix or ".bin"
    file_name = f"{stem_name}{suffix}"
    destination = stem_dir / file_name
    copyfile(source_path, destination)

    return StemAsset(
        stemName=stem_name,
        instrumentHint=instrument_hint,
        provider=provider,
        storedPath=str(destination.relative_to(settings.project_root)).replace("\\", "/"),
        fileName=file_name,
        fileFormat=suffix.lstrip(".").lower() or "bin",
        sizeBytes=destination.stat().st_size,
    )
