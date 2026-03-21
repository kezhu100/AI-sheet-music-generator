from __future__ import annotations

import io
import json
import shutil
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import get_settings
from app.main import app
from app.models.schemas import JobProgress, JobRecord, JobResult, ProviderPreferences, UploadedFileDescriptor, utc_now
from app.services.project_store import project_store
from app.services.job_store import job_store
from app.services import project_packaging


def build_upload(upload_id: str, file_name: str) -> UploadedFileDescriptor:
    return UploadedFileDescriptor(
        uploadId=upload_id,
        fileName=file_name,
        contentType="audio/wav",
        sizeBytes=2048,
        storedPath=f"data/uploads/{upload_id}_{file_name}",
        createdAt=utc_now(),
    )


def build_job(
    job_id: str,
    upload_id: str,
    status: str = "queued",
    provider_preferences: ProviderPreferences | None = None,
) -> JobRecord:
    now = utc_now()
    return JobRecord(
        id=job_id,
        uploadId=upload_id,
        status=status,
        createdAt=now,
        updatedAt=now,
        progress=JobProgress(stage=status, percent=0 if status == "queued" else 100, message=f"Job is {status}."),
        providerPreferences=provider_preferences,
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


def build_clean_original_result(project_name: str = "project-demo", first_pitch: int = 60) -> JobResult:
    result = build_result(project_name, first_pitch=first_pitch)
    return result.model_copy(
        update={
            "tracks": [
                track.model_copy(
                    update={
                        "notes": [
                            note.model_copy(update={"draft_note_id": None})
                            for note in track.notes
                        ]
                    },
                    deep=True,
                )
                for track in result.tracks
            ]
        },
        deep=True,
    )


class ProjectsApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.settings = get_settings()
        self.created_project_ids: list[str] = []
        self.created_file_paths: list[Path] = []

    def tearDown(self) -> None:
        for project_id in self.created_project_ids:
            shutil.rmtree(self.settings.projects_dir / project_id, ignore_errors=True)
            draft_path = self.settings.drafts_dir / f"{project_id}.json"
            if draft_path.exists():
                try:
                    draft_path.unlink()
                except PermissionError:
                    pass
        for file_path in self.created_file_paths:
            if file_path.exists():
                try:
                    file_path.unlink()
                except PermissionError:
                    pass
        for stem_dir in {path.parent for path in self.created_file_paths if path.parent.name}:
            if stem_dir.exists() and stem_dir.is_dir():
                shutil.rmtree(stem_dir, ignore_errors=True)

    def _read_original_result_payload(self, project_id: str) -> JobResult:
        original_result_path = self.settings.projects_dir / project_id / "original-result.json"
        return JobResult.model_validate_json(original_result_path.read_text(encoding="utf-8"))

    def _write_upload_asset(self, upload: UploadedFileDescriptor) -> None:
        upload_path = self.settings.project_root / upload.stored_path
        upload_path.parent.mkdir(parents=True, exist_ok=True)
        upload_path.write_bytes(b"phase13l-upload")
        self.created_file_paths.append(upload_path)

    def _write_stem_assets(self, result: JobResult) -> None:
        for stem in result.stems:
            stem_path = self.settings.project_root / stem.stored_path
            stem_path.parent.mkdir(parents=True, exist_ok=True)
            stem_path.write_bytes(b"phase13l-stem")
            self.created_file_paths.append(stem_path)

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
        job = build_job(
            project_id,
            upload.upload_id,
            status="completed",
            provider_preferences=ProviderPreferences(
                sourceSeparation="demucs",
                pianoTranscription="basic-pitch",
                drumTranscription="demucs-drums",
            ),
        )
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
        self.assertEqual(payload["providerPreferences"]["sourceSeparation"], "demucs")
        self.assertEqual(payload["providerPreferences"]["pianoTranscription"], "basic-pitch")
        self.assertEqual(payload["providerPreferences"]["drumTranscription"], "demucs-drums")

    def test_rerun_project_persists_processing_preferences_and_requeues_same_project(self) -> None:
        project_id = "phase12-project-rerun"
        upload = build_upload(project_id, "phase12-rerun.wav")
        job = build_job(project_id, upload.upload_id, status="completed")
        result = build_result("phase12-rerun")
        self.created_project_ids.append(project_id)
        project_store.create_project(job, upload)
        project_store.mark_completed(job, result)

        with patch("app.api.projects.start_job") as start_job_mock:
            response = TestClient(app).post(
                f"/api/v1/projects/{project_id}/rerun",
                json={
                    "providerPreferences": {
                        "sourceSeparation": "demucs",
                        "pianoTranscription": "basic-pitch",
                        "drumTranscription": "auto",
                    },
                    "processingPreferences": {
                        "pianoFilter": {
                            "enabled": True,
                            "lowCutHz": 65,
                            "highCutHz": 6400,
                            "cleanupStrength": 0.55,
                        }
                    },
                },
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()["project"]
        self.assertEqual(payload["status"], "queued")
        self.assertEqual(payload["providerPreferences"]["sourceSeparation"], "demucs")
        self.assertEqual(payload["processingPreferences"]["pianoFilter"]["lowCutHz"], 65)
        self.assertEqual(payload["processingPreferences"]["pianoFilter"]["cleanupStrength"], 0.55)
        start_job_mock.assert_called_once()
        self.assertEqual(start_job_mock.call_args.args[0], project_id)
        self.assertEqual(start_job_mock.call_args.args[1].upload_id, upload.upload_id)

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

    def test_rename_project_updates_manifest_summary_name_only(self) -> None:
        project_id = "phase125-project-rename"
        upload = build_upload(project_id, "phase125-rename.wav")
        job = build_job(project_id, upload.upload_id, status="completed")
        result = build_result("phase125-original-name")
        self.created_project_ids.append(project_id)
        project_store.create_project(job, upload)
        project_store.mark_completed(job, result)

        response = TestClient(app).patch(f"/api/v1/projects/{project_id}", json={"projectName": "phase125-renamed"})

        self.assertEqual(response.status_code, 200)
        payload = response.json()["project"]
        self.assertEqual(payload["projectName"], "phase125-renamed")
        persisted_result = self._read_original_result_payload(project_id)
        self.assertEqual(persisted_result.project_name, "phase125-original-name")

    def test_delete_project_hides_project_from_library_and_detail_routes(self) -> None:
        project_id = f"phase125-project-delete-{uuid4().hex}"
        upload = build_upload(project_id, "phase125-delete.wav")
        job = build_job(project_id, upload.upload_id, status="completed")
        base_result = build_result("phase125-delete")
        result = base_result.model_copy(
            update={
                "stems": [
                    stem.model_copy(
                        update={
                            "stored_path": f"data/stems/{project_id}/piano_stem.wav",
                        }
                    )
                    for stem in base_result.stems
                ]
            },
            deep=True,
        )
        self.created_project_ids.append(project_id)
        self._write_upload_asset(upload)
        self._write_stem_assets(result)
        upload_path = self.settings.project_root / upload.stored_path
        stem_path = self.settings.project_root / result.stems[0].stored_path
        stem_dir = stem_path.parent
        project_store.create_project(job, upload)
        project_store.mark_completed(job, result)
        client = TestClient(app)
        client.put(
            f"/api/v1/jobs/{project_id}/draft",
            json={"draftResult": build_result("phase125-delete", first_pitch=72).model_dump(mode="json", by_alias=True)},
        )

        with patch.object(project_store, "_unlink_with_retries", return_value=True) as unlink_mock, patch.object(
            project_store,
            "_rmdir_with_retries",
            return_value=True,
        ) as rmdir_mock:
            response = client.delete(f"/api/v1/projects/{project_id}")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(client.get(f"/api/v1/projects/{project_id}").status_code, 404)
        listed_ids = [project["projectId"] for project in client.get("/api/v1/projects").json()["projects"]]
        self.assertNotIn(project_id, listed_ids)
        self.assertIn(upload_path, [call.args[0] for call in unlink_mock.call_args_list])
        self.assertIn(stem_path, [call.args[0] for call in unlink_mock.call_args_list])
        self.assertIn(stem_dir, [call.args[0] for call in rmdir_mock.call_args_list])

    def test_duplicate_project_creates_isolated_saved_draft_and_persisted_fallback_job(self) -> None:
        project_id = f"phase125-project-duplicate-{uuid4().hex}"
        upload = build_upload(project_id, "phase125-duplicate.wav")
        job = build_job(project_id, upload.upload_id, status="completed")
        original_result = build_clean_original_result("phase125-source", first_pitch=60)
        edited_result = build_result("phase125-source", first_pitch=72)
        self.created_project_ids.append(project_id)
        project_store.create_project(job, upload)
        project_store.mark_completed(job, original_result)
        client = TestClient(app)
        client.put(
            f"/api/v1/jobs/{project_id}/draft",
            json={"draftResult": edited_result.model_dump(mode="json", by_alias=True)},
        )

        duplicate_response = client.post(
            f"/api/v1/projects/{project_id}/duplicate",
            json={"projectName": "phase125-duplicate-copy"},
        )

        self.assertEqual(duplicate_response.status_code, 201)
        duplicate_project = duplicate_response.json()["project"]
        duplicate_project_id = duplicate_project["projectId"]
        self.created_project_ids.append(duplicate_project_id)
        self.assertNotEqual(duplicate_project_id, project_id)
        self.assertEqual(duplicate_project["projectName"], "phase125-duplicate-copy")
        self.assertTrue(duplicate_project["hasSavedDraft"])
        self.assertIsNone(duplicate_project["originalResult"]["tracks"][0]["notes"][0]["draftNoteId"])
        duplicated_original = self._read_original_result_payload(duplicate_project_id)
        self.assertIsNone(duplicated_original.tracks[0].notes[0].draft_note_id)

        source_draft = client.get(f"/api/v1/jobs/{project_id}/draft").json()["draft"]
        duplicate_draft = client.get(f"/api/v1/jobs/{duplicate_project_id}/draft").json()["draft"]
        self.assertEqual(duplicate_draft["version"], 1)
        self.assertNotEqual(
            source_draft["result"]["tracks"][0]["notes"][0]["draftNoteId"],
            duplicate_draft["result"]["tracks"][0]["notes"][0]["draftNoteId"],
        )
        self.assertTrue(duplicate_draft["result"]["tracks"][0]["notes"][0]["draftNoteId"].startswith(f"draft:{duplicate_project_id}:"))

        save_duplicate_response = client.put(
            f"/api/v1/jobs/{duplicate_project_id}/draft",
            json={"draftResult": build_result("phase125-source", first_pitch=84).model_dump(mode="json", by_alias=True)},
        )
        self.assertEqual(save_duplicate_response.status_code, 200)

        export_response = client.get(f"/api/v1/jobs/{duplicate_project_id}/exports/midi")
        self.assertEqual(export_response.status_code, 200)
        self.assertEqual(export_response.headers["content-type"], "audio/midi")

    def test_export_project_writes_zip_bundle_with_required_files(self) -> None:
        project_id = "phase13l-project-export"
        upload = build_upload(project_id, "phase13l-export.wav")
        job = build_job(project_id, upload.upload_id, status="completed")
        result = build_result("phase13l-export")
        self.created_project_ids.append(project_id)
        self._write_upload_asset(upload)
        self._write_stem_assets(result)
        project_store.create_project(job, upload)
        project_store.mark_completed(job, result)
        client = TestClient(app)
        client.put(
            f"/api/v1/jobs/{project_id}/draft",
            json={"draftResult": build_result("phase13l-export", first_pitch=72).model_dump(mode="json", by_alias=True)},
        )

        with tempfile.TemporaryDirectory() as temp_dir:
            target_path = str(Path(temp_dir) / "phase13l-export.aismp.zip")
            response = client.post(f"/api/v1/projects/{project_id}/export", json={"targetPath": target_path})

            self.assertEqual(response.status_code, 200)
            self.assertTrue(Path(target_path).exists())
            with zipfile.ZipFile(target_path, "r") as archive:
                names = set(archive.namelist())
                self.assertIn("project-package.json", names)
                self.assertIn("manifest.json", names)
                self.assertIn("original-result.json", names)
                self.assertIn("saved-draft.json", names)
                self.assertIn(f"assets/source-upload/{upload.file_name}", names)
                self.assertIn("assets/stems/piano_stem/piano_stem.wav", names)

    def test_export_project_fails_when_target_path_already_exists(self) -> None:
        project_id = "phase13l-project-export-existing"
        upload = build_upload(project_id, "phase13l-export-existing.wav")
        job = build_job(project_id, upload.upload_id, status="completed")
        result = build_result("phase13l-export-existing")
        self.created_project_ids.append(project_id)
        self._write_upload_asset(upload)
        self._write_stem_assets(result)
        project_store.create_project(job, upload)
        project_store.mark_completed(job, result)

        with tempfile.TemporaryDirectory() as temp_dir:
            target_path = Path(temp_dir) / "existing.aismp.zip"
            target_path.write_bytes(b"already-here")
            response = TestClient(app).post(f"/api/v1/projects/{project_id}/export", json={"targetPath": str(target_path)})

        self.assertEqual(response.status_code, 422)
        self.assertIn("already exists", response.json()["detail"])

    def test_import_project_package_creates_new_local_project_identity_and_restores_assets(self) -> None:
        source_project_id = f"phase13l-import-source-{uuid4().hex}"
        upload = build_upload(source_project_id, "phase13l-import.wav")
        job = build_job(source_project_id, upload.upload_id, status="completed")
        result = build_clean_original_result("phase13l-import-source")
        self.created_project_ids.append(source_project_id)
        self._write_upload_asset(upload)
        self._write_stem_assets(result)
        project_store.create_project(job, upload)
        project_store.mark_completed(job, result)
        client = TestClient(app)
        client.put(
            f"/api/v1/jobs/{source_project_id}/draft",
            json={"draftResult": build_result("phase13l-import-source", first_pitch=72).model_dump(mode="json", by_alias=True)},
        )

        with tempfile.TemporaryDirectory() as temp_dir:
            target_path = str(Path(temp_dir) / "phase13l-import.aismp.zip")
            export_response = client.post(f"/api/v1/projects/{source_project_id}/export", json={"targetPath": target_path})
            self.assertEqual(export_response.status_code, 200)

            with Path(target_path).open("rb") as package_file:
                import_response = client.post(
                    "/api/v1/projects/import",
                    files={"projectPackage": ("phase13l-import.aismp.zip", package_file.read(), "application/zip")},
                )

        self.assertEqual(import_response.status_code, 201)
        imported_project = import_response.json()["project"]
        imported_project_id = imported_project["projectId"]
        self.created_project_ids.append(imported_project_id)
        self.assertNotEqual(imported_project_id, source_project_id)
        self.assertEqual(imported_project["jobId"], imported_project_id)
        self.assertEqual(imported_project["savedDraft"]["jobId"], imported_project_id)
        self.assertTrue(imported_project["savedDraft"]["result"]["tracks"][0]["notes"][0]["draftNoteId"].startswith(f"draft:{imported_project_id}:"))
        self.assertIsNone(imported_project["originalResult"]["tracks"][0]["notes"][0]["draftNoteId"])
        imported_original = self._read_original_result_payload(imported_project_id)
        self.assertIsNone(imported_original.tracks[0].notes[0].draft_note_id)
        self.assertEqual(imported_project["originalResult"]["stems"][0]["storedPath"], f"data/stems/{imported_project_id}/piano_stem.wav")
        self.assertEqual(imported_project["upload"]["storedPath"], f"data/uploads/{imported_project_id}_{upload.file_name}")

        export_response = client.get(f"/api/v1/jobs/{imported_project_id}/exports/midi")
        self.assertEqual(export_response.status_code, 200)

    def test_import_project_package_succeeds_without_saved_draft_file(self) -> None:
        source_project_id = "phase13l-import-no-saved-draft"
        upload = build_upload(source_project_id, "phase13l-import-no-saved-draft.wav")
        job = build_job(source_project_id, upload.upload_id, status="completed")
        result = build_result("phase13l-import-no-saved-draft")
        self.created_project_ids.append(source_project_id)
        self._write_upload_asset(upload)
        self._write_stem_assets(result)
        project_store.create_project(job, upload)
        project_store.mark_completed(job, result)
        client = TestClient(app)

        with tempfile.TemporaryDirectory() as temp_dir:
            target_path = str(Path(temp_dir) / "phase13l-import-no-saved-draft.aismp.zip")
            export_response = client.post(f"/api/v1/projects/{source_project_id}/export", json={"targetPath": target_path})
            self.assertEqual(export_response.status_code, 200)

            package_buffer = io.BytesIO()
            with zipfile.ZipFile(target_path, "r") as source_archive, zipfile.ZipFile(
                package_buffer, "w", compression=zipfile.ZIP_DEFLATED
            ) as rebuilt_archive:
                for info in source_archive.infolist():
                    if info.filename == "saved-draft.json":
                        continue
                    rebuilt_archive.writestr(info.filename, source_archive.read(info.filename))

            import_response = client.post(
                "/api/v1/projects/import",
                files={"projectPackage": ("phase13l-import-no-saved-draft.aismp.zip", package_buffer.getvalue(), "application/zip")},
            )

        self.assertEqual(import_response.status_code, 201)
        imported_project = import_response.json()["project"]
        self.created_project_ids.append(imported_project["projectId"])
        self.assertFalse(imported_project["hasSavedDraft"])
        self.assertIsNone(imported_project["savedDraft"])

    def test_import_project_package_succeeds_without_optional_assets(self) -> None:
        package_buffer = io.BytesIO()
        now = utc_now().isoformat()
        base_result = build_result("phase13l-core-only-package")
        result = JobResult(
            projectName=base_result.project_name,
            bpm=base_result.bpm,
            stems=[
                stem.model_copy(
                    update={
                        "stem_name": "missing_core_only_stem",
                        "stored_path": "data/stems/nonexistent-phase13l-core-only/missing_core_only_stem.wav",
                        "file_name": "missing_core_only_stem.wav",
                    }
                )
                for stem in base_result.stems
            ],
            tracks=[track.model_copy(deep=True) for track in base_result.tracks],
            warnings=list(base_result.warnings),
        )
        manifest = {
            "summary": {
                "projectId": "core-only-source",
                "jobId": "core-only-source",
                "projectName": "phase13l-core-only-package",
                "createdAt": now,
                "updatedAt": now,
                "status": "completed",
                "hasSavedDraft": False,
                "draftVersion": None,
                "draftSavedAt": None,
                "assets": {
                    "hasSourceUpload": False,
                    "hasStems": False,
                    "hasOriginalResult": True,
                    "availableExports": ["midi", "musicxml"],
                },
                "sharePath": "/projects/core-only-source",
                "currentStage": "completed",
                "statusMessage": "Completed.",
                "error": None,
                "stemCount": len(result.stems),
                "trackCount": len(result.tracks),
            },
            "upload": None,
            "currentStage": "completed",
            "statusMessage": "Completed.",
            "error": None,
            "draftSavedAt": None,
        }
        package_manifest = {
            "formatVersion": 1,
            "sourceProjectId": "core-only-source",
            "sourceJobId": "core-only-source",
            "exportedAt": now,
            "includesSavedDraft": False,
            "includesSourceUpload": False,
            "includedStemCount": 0,
        }

        with zipfile.ZipFile(package_buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("project-package.json", json.dumps(package_manifest))
            archive.writestr("manifest.json", json.dumps(manifest))
            archive.writestr("original-result.json", result.model_dump_json(by_alias=True))

        response = TestClient(app).post(
            "/api/v1/projects/import",
            files={"projectPackage": ("phase13l-core-only-package.zip", package_buffer.getvalue(), "application/zip")},
        )

        self.assertEqual(response.status_code, 201)
        imported_project = response.json()["project"]
        self.created_project_ids.append(imported_project["projectId"])
        self.assertFalse(imported_project["assets"]["hasSourceUpload"])
        self.assertFalse(imported_project["assets"]["hasStems"])
        self.assertTrue(imported_project["assets"]["hasOriginalResult"])
        self.assertTrue(any("missing some persisted stem assets" in warning.lower() for warning in imported_project["originalResult"]["warnings"]))

    def test_open_local_path_returns_existing_managed_project_when_path_is_inside_library(self) -> None:
        project_id = "phase13l-open-existing"
        upload = build_upload(project_id, "phase13l-open-existing.wav")
        job = build_job(project_id, upload.upload_id, status="completed")
        result = build_result("phase13l-open-existing")
        self.created_project_ids.append(project_id)
        project_store.create_project(job, upload)
        project_store.mark_completed(job, result)

        response = TestClient(app).post(
            "/api/v1/projects/open-local",
            json={"path": str(self.settings.projects_dir / project_id)},
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["project"]["projectId"], project_id)
        self.assertIsNone(payload["packageMetadata"])

    def test_open_local_path_imports_external_project_folder_as_new_instance(self) -> None:
        source_project_id = "phase13l-external-folder-source"
        upload = build_upload(source_project_id, "phase13l-external.wav")
        result = build_result("phase13l-external-source")
        manifest = {
            "summary": {
                "projectId": source_project_id,
                "jobId": source_project_id,
                "projectName": "phase13l-external-source",
                "createdAt": utc_now().isoformat(),
                "updatedAt": utc_now().isoformat(),
                "status": "completed",
                "hasSavedDraft": False,
                "draftVersion": None,
                "draftSavedAt": None,
                "assets": {
                    "hasSourceUpload": False,
                    "hasStems": False,
                    "hasOriginalResult": True,
                    "availableExports": ["midi", "musicxml"],
                },
                "sharePath": f"/projects/{source_project_id}",
                "currentStage": "completed",
                "statusMessage": "Completed.",
                "error": None,
                "stemCount": len(result.stems),
                "trackCount": len(result.tracks),
            },
            "upload": upload.model_dump(mode="json", by_alias=True),
            "currentStage": "completed",
            "statusMessage": "Completed.",
            "error": None,
            "draftSavedAt": None,
        }

        with tempfile.TemporaryDirectory() as temp_dir:
            source_dir = Path(temp_dir) / "external-project"
            source_dir.mkdir(parents=True, exist_ok=True)
            (source_dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
            (source_dir / "original-result.json").write_text(result.model_dump_json(by_alias=True, indent=2), encoding="utf-8")

            response = TestClient(app).post("/api/v1/projects/open-local", json={"path": str(source_dir)})

        self.assertEqual(response.status_code, 200)
        imported_project = response.json()["project"]
        self.created_project_ids.append(imported_project["projectId"])
        self.assertNotEqual(imported_project["projectId"], source_project_id)
        self.assertEqual(imported_project["status"], "completed")

    def test_import_rejects_unsafe_zip_entries(self) -> None:
        package_buffer = io.BytesIO()
        with zipfile.ZipFile(package_buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("../unsafe.txt", b"unsafe")

        response = TestClient(app).post(
            "/api/v1/projects/import",
            files={"projectPackage": ("unsafe.zip", package_buffer.getvalue(), "application/zip")},
        )

        self.assertEqual(response.status_code, 422)
        self.assertIn("unsafe", response.json()["detail"].lower())

    def test_import_rejects_missing_required_package_files(self) -> None:
        package_buffer = io.BytesIO()
        with zipfile.ZipFile(package_buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("manifest.json", "{}")

        response = TestClient(app).post(
            "/api/v1/projects/import",
            files={"projectPackage": ("missing-required.zip", package_buffer.getvalue(), "application/zip")},
        )

        self.assertEqual(response.status_code, 422)
        self.assertIn("missing", response.json()["detail"].lower())

    def test_import_rejects_unknown_package_version(self) -> None:
        package_buffer = io.BytesIO()
        with zipfile.ZipFile(package_buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            archive.writestr(
                "project-package.json",
                json.dumps(
                    {
                        "formatVersion": 999,
                        "sourceProjectId": "source-project",
                        "sourceJobId": "source-job",
                        "exportedAt": utc_now().isoformat(),
                        "includesSavedDraft": False,
                        "includesSourceUpload": False,
                        "includedStemCount": 0,
                    }
                ),
            )
            archive.writestr("manifest.json", "{}")
            archive.writestr("original-result.json", "{}")

        response = TestClient(app).post(
            "/api/v1/projects/import",
            files={"projectPackage": ("unknown-version.zip", package_buffer.getvalue(), "application/zip")},
        )

        self.assertEqual(response.status_code, 422)
        self.assertIn("unsupported project package version", response.json()["detail"].lower())

    def test_import_rejects_package_that_exceeds_size_limit(self) -> None:
        package_buffer = io.BytesIO()
        with zipfile.ZipFile(package_buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            archive.writestr(
                "project-package.json",
                json.dumps(
                    {
                        "formatVersion": 1,
                        "sourceProjectId": "source-project",
                        "sourceJobId": "source-job",
                        "exportedAt": utc_now().isoformat(),
                        "includesSavedDraft": False,
                        "includesSourceUpload": False,
                        "includedStemCount": 0,
                    }
                ),
            )
            archive.writestr("manifest.json", json.dumps({"summary": {"projectId": "a", "jobId": "a", "projectName": "a", "createdAt": utc_now().isoformat(), "updatedAt": utc_now().isoformat(), "status": "completed", "hasSavedDraft": False, "draftVersion": None, "draftSavedAt": None, "assets": {"hasSourceUpload": False, "hasStems": False, "hasOriginalResult": True, "availableExports": []}, "sharePath": "/projects/a", "currentStage": "completed", "statusMessage": "Completed.", "error": None, "stemCount": 0, "trackCount": 1}}))
            archive.writestr("original-result.json", build_result("phase13l-large").model_dump_json(by_alias=True))

        original_limit = project_packaging.MAX_PACKAGE_UNCOMPRESSED_BYTES
        try:
            project_packaging.MAX_PACKAGE_UNCOMPRESSED_BYTES = 10
            response = TestClient(app).post(
                "/api/v1/projects/import",
                files={"projectPackage": ("too-large.zip", package_buffer.getvalue(), "application/zip")},
            )
        finally:
            project_packaging.MAX_PACKAGE_UNCOMPRESSED_BYTES = original_limit

        self.assertEqual(response.status_code, 422)
        self.assertIn("size limit", response.json()["detail"].lower())


if __name__ == "__main__":
    unittest.main()
