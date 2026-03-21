from __future__ import annotations

from pathlib import Path
import sys
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app
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


if __name__ == "__main__":
    unittest.main()
