from __future__ import annotations

from pathlib import Path
from shutil import copyfile
from uuid import uuid4

from fastapi import UploadFile

from app.core.config import get_settings
from app.models.schemas import StemAsset, UploadedFileDescriptor, utc_now


class UploadTooLargeError(Exception):
    pass


class UploadStorageError(Exception):
    pass


async def save_upload(file: UploadFile) -> UploadedFileDescriptor:
    settings = get_settings()
    upload_id = uuid4().hex
    target_name = f"{upload_id}_{file.filename or 'audio.bin'}"
    destination = settings.uploads_dir / target_name
    size_bytes = 0

    try:
        with destination.open("wb") as output_file:
            while True:
                chunk = await file.read(settings.upload_stream_chunk_size_bytes)
                if not chunk:
                    break

                size_bytes += len(chunk)
                if size_bytes > settings.max_upload_size_bytes:
                    raise UploadTooLargeError(
                        f"Upload exceeds the local size limit of {_format_size_bytes(settings.max_upload_size_bytes)}."
                    )

                output_file.write(chunk)
    except UploadTooLargeError:
        destination.unlink(missing_ok=True)
        raise
    except OSError as exc:
        destination.unlink(missing_ok=True)
        raise UploadStorageError("Failed to store the uploaded file on local disk.") from exc
    except Exception as exc:
        destination.unlink(missing_ok=True)
        raise UploadStorageError("Upload was interrupted before the file could be stored safely.") from exc

    return UploadedFileDescriptor(
        uploadId=upload_id,
        fileName=file.filename or target_name,
        contentType=file.content_type or "application/octet-stream",
        sizeBytes=size_bytes,
        storedPath=str(destination.relative_to(settings.project_root)).replace("\\", "/"),
        createdAt=utc_now(),
    )


def resolve_upload_path(stored_path: str) -> Path:
    settings = get_settings()
    return settings.project_root / stored_path


def resolve_project_path(stored_path: str) -> Path:
    settings = get_settings()
    return settings.project_root / stored_path


def persist_stem_file(*, source_path: Path, job_id: str, stem_name: str, instrument_hint: str, provider: str) -> StemAsset:
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


def persist_stem_copy(*, source_path: Path, job_id: str, stem_name: str, instrument_hint: str, provider: str) -> StemAsset:
    return persist_stem_file(
        source_path=source_path,
        job_id=job_id,
        stem_name=stem_name,
        instrument_hint=instrument_hint,
        provider=provider,
    )


def _format_size_bytes(size_bytes: int) -> str:
    if size_bytes >= 1024 * 1024:
        return f"{size_bytes / (1024 * 1024):.0f} MB"
    if size_bytes >= 1024:
        return f"{size_bytes / 1024:.0f} KB"
    return f"{size_bytes} bytes"
