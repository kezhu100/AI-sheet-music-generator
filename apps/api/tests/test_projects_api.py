from __future__ import annotations

import shutil
import sys
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import get_settings
from app.main import app
from app.models.schemas import JobProgress, JobRecord, JobResult, UploadedFileDescriptor, utc_now
from app.services.project_store import project_store
from app.services.job_store import job_store


def build_upload(upload_id: str, file_name: str) -> UploadedFileDescriptor:
    return UploadedFileDescriptor(
        uploadId=upload_id,
        fileName=file_name,
        contentType="audio/wav",
        sizeBytes=2048,
        storedPath=f"data/uploads/{upload_id}_{file_name}",
        createdAt=utc_now(),
    )


def build_job(job_id: str, upload_id: str, status: str = "queued") -> JobRecord:
    now = utc_now()
    return JobRecord(
        id=job_id,
        uploadId=upload_id,
        status=status,
        createdAt=now,
        updatedAt=now,
        progress=JobProgress(stage=status, percent=0 if status == "queued" else 100, message=f"Job is {status}."),
    )


def build_result(project_name: str = "project-demo", first_pitch: int = 60) -> JobResult:
    return JobResult.model_validate(
        {
            "projectName": project_name,
            "bpm": 120,
            "warnings": [],
            "stems": [
                {
                    "stemName": "piano_stem",
                    "instrumentHint": "piano",
                    "provider": "development-copy",
                    "storedPath": "data/stems/project-demo/piano_stem.wav",
                    "fileName": "piano_stem.wav",
                    "fileFormat": "wav",
                    "sizeBytes": 4096,
                }
            ],
            "tracks": [
                {
                    "instrument": "piano",
                    "sourceStem": "piano_stem",
                    "provider": "heuristic",
                    "eventCount": 1,
                    "notes": [
                        {
                            "id": "note-a",
                            "draftNoteId": "draft:piano:note-a",
                            "instrument": "piano",
                            "pitch": first_pitch,
                            "onsetSec": 0.5,
                            "offsetSec": 1.0,
                            "sourceStem": "piano_stem",
                        }
                    ],
                }
            ],
        }
    )


class ProjectsApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.settings = get_settings()
        self.created_project_ids: list[str] = []

    def tearDown(self) -> None:
        for project_id in self.created_project_ids:
            shutil.rmtree(self.settings.projects_dir / project_id, ignore_errors=True)
            draft_path = self.settings.drafts_dir / f"{project_id}.json"
            if draft_path.exists():
                try:
                    draft_path.unlink()
                except PermissionError:
                    pass

    def _read_original_result_payload(self, project_id: str) -> JobResult:
        original_result_path = self.settings.projects_dir / project_id / "original-result.json"
        return JobResult.model_validate_json(original_result_path.read_text(encoding="utf-8"))

    def test_projects_endpoint_lists_manifest_backed_projects(self) -> None:
        project_id = "phase12-project-list"
        upload = build_upload(project_id, "phase12-list.wav")
        job = build_job(project_id, upload.upload_id)
        self.created_project_ids.append(project_id)
        project_store.create_project(job, upload)

        response = TestClient(app).get("/api/v1/projects")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        project = next(item for item in payload["projects"] if item["projectId"] == project_id)
        self.assertEqual(project["projectName"], "phase12-list")
        self.assertEqual(project["sharePath"], f"/projects/{project_id}")
        self.assertTrue(project["assets"]["hasSourceUpload"])
        self.assertFalse(project["assets"]["hasOriginalResult"])

    def test_project_detail_returns_original_result_for_completed_project(self) -> None:
        project_id = "phase12-project-detail"
        upload = build_upload(project_id, "phase12-detail.wav")
        job = build_job(project_id, upload.upload_id, status="completed")
        result = build_result("phase12-detail")
        self.created_project_ids.append(project_id)
        project_store.create_project(job, upload)
        project_store.mark_completed(job, result)

        response = TestClient(app).get(f"/api/v1/projects/{project_id}")

        self.assertEqual(response.status_code, 200)
        payload = response.json()["project"]
        self.assertEqual(payload["projectId"], project_id)
        self.assertEqual(payload["originalResult"]["projectName"], "phase12-detail")
        self.assertEqual(payload["assets"]["availableExports"], ["midi", "musicxml"])
        self.assertTrue(payload["assets"]["hasOriginalResult"])

    def test_mark_completed_writes_original_result_from_completed_backend_result(self) -> None:
        project_id = "phase12-project-original-write"
        upload = build_upload(project_id, "phase12-original-write.wav")
        job = build_job(project_id, upload.upload_id, status="completed")
        result = build_result("phase12-original-write", first_pitch=64)
        self.created_project_ids.append(project_id)

        project_store.create_project(job, upload)
        project_store.mark_completed(job, result)

        persisted_result = self._read_original_result_payload(project_id)
        self.assertEqual(persisted_result.project_name, "phase12-original-write")
        self.assertEqual(persisted_result.tracks[0].notes[0].pitch, 64)

    def test_original_result_is_not_overwritten_by_later_completion_or_sync_updates(self) -> None:
        project_id = "phase12-project-original-immutable"
        upload = build_upload(project_id, "phase12-original-immutable.wav")
        job = build_job(project_id, upload.upload_id, status="completed")
        first_result = build_result("phase12-original-first", first_pitch=60)
        later_result = build_result("phase12-original-later", first_pitch=72)
        self.created_project_ids.append(project_id)

        project_store.create_project(job, upload)
        project_store.mark_completed(job, first_result)
        persisted_after_first_completion = self._read_original_result_payload(project_id)

        job.result = later_result
        project_store.sync_job(job)
        project_store.mark_completed(job, later_result)
        persisted_after_later_updates = self._read_original_result_payload(project_id)

        self.assertEqual(persisted_after_first_completion.project_name, "phase12-original-first")
        self.assertEqual(persisted_after_first_completion.tracks[0].notes[0].pitch, 60)
        self.assertEqual(persisted_after_later_updates.project_name, "phase12-original-first")
        self.assertEqual(persisted_after_later_updates.tracks[0].notes[0].pitch, 60)

    def test_saving_draft_updates_project_metadata(self) -> None:
        upload = build_upload("phase12-project-draft", "phase12-draft.wav")
        job = job_store.create(upload.upload_id)
        project_id = job.id
        self.created_project_ids.append(project_id)
        result = build_result("phase12-draft")
        job_store.complete(job.id, result)
        project_store.create_project(job, upload)
        project_store.mark_completed(job_store.get(job.id), result)
        client = TestClient(app)

        save_response = client.put(
            f"/api/v1/jobs/{project_id}/draft",
            json={"draftResult": build_result("phase12-draft", first_pitch=72).model_dump(mode="json", by_alias=True)},
        )
        detail_response = client.get(f"/api/v1/projects/{project_id}")

        self.assertEqual(save_response.status_code, 200)
        self.assertEqual(detail_response.status_code, 200)
        payload = detail_response.json()["project"]
        self.assertTrue(payload["hasSavedDraft"])
        self.assertEqual(payload["draftVersion"], 1)
        self.assertEqual(payload["savedDraft"]["result"]["tracks"][0]["notes"][0]["pitch"], 72)

    def test_saving_draft_does_not_overwrite_original_result(self) -> None:
        upload = build_upload("phase12-project-draft-original", "phase12-draft-original.wav")
        job = job_store.create(upload.upload_id)
        project_id = job.id
        self.created_project_ids.append(project_id)
        original_result = build_result("phase12-original-stable", first_pitch=60)
        edited_result = build_result("phase12-original-stable", first_pitch=72)
        job_store.complete(job.id, original_result)
        project_store.create_project(job, upload)
        project_store.mark_completed(job_store.get(job.id), original_result)
        client = TestClient(app)

        client.put(
            f"/api/v1/jobs/{project_id}/draft",
            json={"draftResult": edited_result.model_dump(mode="json", by_alias=True)},
        )

        persisted_result = self._read_original_result_payload(project_id)
        self.assertEqual(persisted_result.project_name, "phase12-original-stable")
        self.assertEqual(persisted_result.tracks[0].notes[0].pitch, 60)


if __name__ == "__main__":
    unittest.main()
