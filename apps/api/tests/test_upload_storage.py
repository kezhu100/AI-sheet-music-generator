from __future__ import annotations

from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import sys
import unittest
from unittest.mock import patch

from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api.uploads import create_upload
from app.core.config import Settings
from app.services.storage import save_upload


class ChunkedUploadFile:
    def __init__(self, *, filename: str, content_type: str, payload: bytes) -> None:
        self.filename = filename
        self.content_type = content_type
        self._payload = payload
        self._offset = 0
        self.read_calls = 0
        self.requested_sizes: list[int] = []

    async def read(self, size: int = -1) -> bytes:
        self.read_calls += 1
        self.requested_sizes.append(size)

        if self._offset >= len(self._payload):
            return b""

        if size is None or size < 0:
            size = len(self._payload) - self._offset

        start = self._offset
        end = min(len(self._payload), start + size)
        self._offset = end
        return self._payload[start:end]


class UploadStorageTests(unittest.IsolatedAsyncioTestCase):
    async def test_small_upload_streams_to_disk_without_buffering_whole_file(self) -> None:
        with TemporaryDirectory() as temp_dir:
            settings = self._build_settings(Path(temp_dir), max_upload_size_bytes=1024, chunk_size_bytes=4)
            file = ChunkedUploadFile(
                filename="demo.wav",
                content_type="audio/wav",
                payload=b"abcdefghij",
            )

            with patch("app.services.storage.get_settings", return_value=settings), patch(
                "app.services.storage.uuid4",
                return_value=SimpleNamespace(hex="upload-small"),
            ):
                upload = await save_upload(file)

            stored_path = settings.project_root / upload.stored_path
            self.assertTrue(stored_path.exists())
            self.assertEqual(stored_path.read_bytes(), b"abcdefghij")
            self.assertEqual(upload.size_bytes, 10)
            self.assertGreater(file.read_calls, 2)
            self.assertTrue(all(size == 4 for size in file.requested_sizes[:-1]))

    async def test_large_upload_returns_413_and_removes_partial_file(self) -> None:
        with TemporaryDirectory() as temp_dir:
            settings = self._build_settings(Path(temp_dir), max_upload_size_bytes=5, chunk_size_bytes=3)
            file = ChunkedUploadFile(
                filename="too-large.mp3",
                content_type="audio/mp3",
                payload=b"abcdefghi",
            )

            with patch("app.services.storage.get_settings", return_value=settings), patch(
                "app.services.storage.uuid4",
                return_value=SimpleNamespace(hex="upload-large"),
            ):
                with self.assertRaises(HTTPException) as context:
                    await create_upload(file)

            self.assertEqual(context.exception.status_code, 413)
            self.assertIn("local size limit", context.exception.detail)
            partial_path = settings.uploads_dir / "upload-large_too-large.mp3"
            self.assertFalse(partial_path.exists())

    async def test_streaming_path_reads_multiple_chunks_before_success(self) -> None:
        with TemporaryDirectory() as temp_dir:
            settings = self._build_settings(Path(temp_dir), max_upload_size_bytes=1024, chunk_size_bytes=2)
            file = ChunkedUploadFile(
                filename="chunked.aac",
                content_type="audio/aac",
                payload=b"1234567",
            )

            with patch("app.services.storage.get_settings", return_value=settings), patch(
                "app.services.storage.uuid4",
                return_value=SimpleNamespace(hex="upload-chunked"),
            ):
                await save_upload(file)

            self.assertGreaterEqual(file.read_calls, 4)
            self.assertGreaterEqual(file.requested_sizes.count(2), 3)

    def _build_settings(self, root: Path, *, max_upload_size_bytes: int, chunk_size_bytes: int) -> Settings:
        uploads_dir = root / "data" / "uploads"
        stems_dir = root / "data" / "stems"
        drafts_dir = root / "data" / "drafts"
        projects_dir = root / "data" / "projects"
        uploads_dir.mkdir(parents=True, exist_ok=True)
        stems_dir.mkdir(parents=True, exist_ok=True)
        drafts_dir.mkdir(parents=True, exist_ok=True)
        projects_dir.mkdir(parents=True, exist_ok=True)
        return Settings(
            project_root=root,
            data_dir=root / "data",
            uploads_dir=uploads_dir,
            stems_dir=stems_dir,
            drafts_dir=drafts_dir,
            projects_dir=projects_dir,
            max_upload_size_bytes=max_upload_size_bytes,
            upload_stream_chunk_size_bytes=chunk_size_bytes,
        )


if __name__ == "__main__":
    unittest.main()
