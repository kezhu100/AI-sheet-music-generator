from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
import sys
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app
from app.core.config import get_settings
from app.models.schemas import UploadedFileDescriptor, utc_now
from app.services.upload_registry import upload_registry


class JobsApiTests(unittest.TestCase):
    def test_create_job_accepts_provider_preferences(self) -> None:
        upload = UploadedFileDescriptor(
            uploadId="upload-provider-preferences",
            fileName="demo.wav",
            contentType="audio/wav",
            sizeBytes=1024,
            storedPath="data/uploads/demo.wav",
            createdAt=utc_now(),
        )
        upload_registry.add(upload)

        with patch("app.api.jobs.project_store.create_project"), patch("app.api.jobs.start_job") as start_job_mock:
            response = TestClient(app).post(
                "/api/v1/jobs",
                json={
                    "uploadId": upload.upload_id,
                    "providerPreferences": {
                        "sourceSeparation": "demucs",
                        "pianoTranscription": "basic-pitch",
                        "drumTranscription": "demucs-drums",
                    },
                },
            )

        self.assertEqual(response.status_code, 201)
        payload = response.json()["job"]
        self.assertEqual(payload["providerPreferences"]["sourceSeparation"], "demucs")
        self.assertEqual(payload["providerPreferences"]["pianoTranscription"], "basic-pitch")
        self.assertEqual(payload["providerPreferences"]["drumTranscription"], "demucs-drums")
        start_job_mock.assert_called_once()
        _, _, provider_preferences = start_job_mock.call_args.args
        self.assertEqual(provider_preferences.source_separation, "demucs")
        self.assertEqual(provider_preferences.piano_transcription, "basic-pitch")
        self.assertEqual(provider_preferences.drum_transcription, "demucs-drums")

    def test_get_job_stem_asset_streams_local_stem_file(self) -> None:
        settings = get_settings()
        stem_dir = settings.stems_dir / "job-stem-preview"
        stem_dir.mkdir(parents=True, exist_ok=True)
        stem_path = stem_dir / "piano_preview.wav"
        stem_bytes = b"RIFFdemoWAVEfmt "
        stem_path.write_bytes(stem_bytes)

        job = SimpleNamespace(
            result=SimpleNamespace(
                stems=[
                    SimpleNamespace(
                        stem_name="piano_stem",
                        stored_path=str(stem_path.relative_to(settings.project_root)).replace("\\", "/"),
                        file_name="piano_preview.wav",
                    )
                ]
            )
        )

        with patch("app.api.jobs._get_completed_job", return_value=job):
            response = TestClient(app).get("/api/v1/jobs/job-stem-preview/stems/piano_stem")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, stem_bytes)
        self.assertEqual(response.headers["content-type"], "audio/wav")


if __name__ == "__main__":
    unittest.main()
