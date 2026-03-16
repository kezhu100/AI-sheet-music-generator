from __future__ import annotations

from threading import Lock
from typing import Optional

from app.models.schemas import UploadedFileDescriptor


class UploadRegistry:
    def __init__(self) -> None:
        self._uploads: dict[str, UploadedFileDescriptor] = {}
        self._lock = Lock()

    def add(self, upload: UploadedFileDescriptor) -> None:
        with self._lock:
            self._uploads[upload.upload_id] = upload

    def get(self, upload_id: str) -> Optional[UploadedFileDescriptor]:
        with self._lock:
            return self._uploads.get(upload_id)


upload_registry = UploadRegistry()
