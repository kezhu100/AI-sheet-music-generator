from __future__ import annotations

import gc
import os
import shutil
import stat
import time
from pathlib import Path
from threading import Lock
from typing import Optional
from uuid import uuid4

from app.core.config import get_settings
from app.models.schemas import (
    JobDraftRecord,
    JobProgress,
    JobRecord,
    JobResult,
    ProjectAssetAvailability,
    ProjectDetail,
    ProjectManifestRecord,
    ProjectSummary,
    ProviderPreferences,
    UploadedFileDescriptor,
    utc_now,
)
from app.services.draft_store import draft_store


class ProjectStore:
    def __init__(self, projects_dir: Path) -> None:
        self._projects_dir = projects_dir
        self._lock = Lock()
        self._projects_dir.mkdir(parents=True, exist_ok=True)

    def create_project(
        self,
        job: JobRecord,
        upload: UploadedFileDescriptor,
        provider_preferences: ProviderPreferences | None = None,
    ) -> ProjectManifestRecord:
        manifest = ProjectManifestRecord(
            summary=ProjectSummary(
                projectId=job.id,
                jobId=job.id,
                projectName=Path(upload.file_name).stem or upload.file_name,
                createdAt=job.created_at,
                updatedAt=job.updated_at,
                status=job.status,
                hasSavedDraft=False,
                draftVersion=None,
                draftSavedAt=None,
                providerPreferences=provider_preferences if provider_preferences is not None else job.provider_preferences,
                assets=ProjectAssetAvailability(
                    hasSourceUpload=True,
                    hasStems=False,
                    hasOriginalResult=False,
                    availableExports=[],
                ),
                sharePath=f"/projects/{job.id}",
                currentStage=job.progress.stage,
                statusMessage=job.progress.message,
                error=job.error,
                stemCount=None,
                trackCount=None,
            ),
            upload=upload,
            currentStage=job.progress.stage,
            statusMessage=job.progress.message,
            error=job.error,
        )
        self._write_manifest(manifest)
        return manifest

    def sync_job(self, job: JobRecord) -> Optional[ProjectManifestRecord]:
        manifest = self._read_manifest(job.id)
        if manifest is None:
            return None

        manifest.summary.status = job.status
        manifest.summary.updated_at = job.updated_at
        manifest.current_stage = job.progress.stage
        manifest.status_message = job.progress.message
        manifest.error = job.error

        if job.result is not None:
            self._apply_completed_result_summary(manifest, job.result)
            self._write_original_result_if_missing(job.id, job.result)

        self._write_manifest(manifest)
        return manifest

    def mark_completed(self, job: JobRecord, result: JobResult) -> Optional[ProjectManifestRecord]:
        manifest = self._read_manifest(job.id)
        if manifest is None:
            return None

        manifest.summary.status = job.status
        manifest.summary.updated_at = job.updated_at
        self._apply_completed_result_summary(manifest, result)
        manifest.current_stage = job.progress.stage
        manifest.status_message = job.progress.message
        manifest.error = job.error

        self._write_original_result_if_missing(job.id, result)
        self._write_manifest(manifest)
        return manifest

    def mark_failed(self, job: JobRecord) -> Optional[ProjectManifestRecord]:
        manifest = self._read_manifest(job.id)
        if manifest is None:
            return None

        manifest.summary.status = job.status
        manifest.summary.updated_at = job.updated_at
        manifest.current_stage = job.progress.stage
        manifest.status_message = job.progress.message
        manifest.error = job.error
        self._write_manifest(manifest)
        return manifest

    def record_draft_saved(self, draft: JobDraftRecord) -> Optional[ProjectManifestRecord]:
        manifest = self._read_manifest(draft.job_id)
        if manifest is None:
            return None

        manifest.summary.has_saved_draft = True
        manifest.summary.draft_version = draft.version
        manifest.summary.updated_at = draft.saved_at
        manifest.summary.draft_saved_at = draft.saved_at
        manifest.draft_saved_at = draft.saved_at
        self._write_manifest(manifest)
        return manifest

    def rename_project(self, project_id: str, project_name: str) -> Optional[ProjectDetail]:
        manifest = self._read_manifest(project_id)
        if manifest is None or manifest.deleted_at is not None:
            return None

        manifest.summary.project_name = project_name.strip()
        manifest.summary.updated_at = utc_now()
        self._write_manifest(manifest)
        return self.get_project_detail(project_id)

    def delete_project(self, project_id: str) -> bool:
        manifest = self._read_manifest(project_id)
        if manifest is None or manifest.deleted_at is not None:
            return False

        manifest.deleted_at = utc_now()
        self._write_manifest(manifest)
        with self._lock:
            project_dir = self._project_dir(project_id)
            for attempt in range(3):
                for child_path in project_dir.glob("*"):
                    try:
                        if child_path.is_dir():
                            shutil.rmtree(child_path, ignore_errors=True)
                        else:
                            os.chmod(child_path, stat.S_IWRITE)
                            child_path.unlink()
                    except PermissionError:
                        gc.collect()
                        time.sleep(0.02 * (attempt + 1))
                try:
                    project_dir.rmdir()
                except OSError:
                    gc.collect()
                    time.sleep(0.02 * (attempt + 1))
                if not project_dir.exists():
                    break
            draft_store.delete(manifest.summary.job_id)
        return True

    def duplicate_project(self, project_id: str, project_name: Optional[str] = None) -> Optional[ProjectDetail]:
        source_manifest = self._read_manifest(project_id)
        if source_manifest is None or source_manifest.deleted_at is not None:
            return None

        duplicate_project_id = uuid4().hex
        duplicate_name = project_name.strip() if project_name else self._build_duplicate_project_name(source_manifest.summary.project_name)
        now = utc_now()
        original_result = self._read_original_result(project_id)
        saved_draft = draft_store.get(source_manifest.summary.job_id)

        duplicate_manifest = ProjectManifestRecord(
            summary=ProjectSummary(
                projectId=duplicate_project_id,
                jobId=duplicate_project_id,
                projectName=duplicate_name,
                createdAt=now,
                updatedAt=now,
                status="completed" if original_result is not None else source_manifest.summary.status,
                hasSavedDraft=saved_draft is not None,
                draftVersion=1 if saved_draft is not None else None,
                draftSavedAt=now if saved_draft is not None else None,
                providerPreferences=source_manifest.summary.provider_preferences,
                assets=source_manifest.summary.assets.model_copy(deep=True),
                sharePath=f"/projects/{duplicate_project_id}",
                currentStage="completed" if original_result is not None else source_manifest.summary.current_stage,
                statusMessage=(
                    "Duplicated from an existing local project."
                    if original_result is not None
                    else source_manifest.summary.status_message or "Duplicated from an existing local project."
                ),
                error=None if original_result is not None else source_manifest.summary.error,
                stemCount=source_manifest.summary.stem_count,
                trackCount=source_manifest.summary.track_count,
            ),
            upload=source_manifest.upload.model_copy(deep=True) if source_manifest.upload is not None else None,
            currentStage="completed" if original_result is not None else source_manifest.current_stage,
            statusMessage=(
                "Duplicated from an existing local project."
                if original_result is not None
                else source_manifest.status_message or "Duplicated from an existing local project."
            ),
            error=None if original_result is not None else source_manifest.error,
            draftSavedAt=now if saved_draft is not None else None,
        )

        if original_result is not None:
            self._write_original_result(duplicate_project_id, original_result)
        if saved_draft is not None:
            namespaced_saved_draft = JobDraftRecord(
                jobId=duplicate_project_id,
                version=1,
                savedAt=now,
                result=self._namespace_draft_note_ids(saved_draft.result, duplicate_project_id),
            )
            draft_store.save_record(namespaced_saved_draft)

        self._write_manifest(duplicate_manifest)
        return self.get_project_detail(duplicate_project_id)

    def list_projects(self) -> list[ProjectSummary]:
        manifests: list[ProjectSummary] = []
        for project_dir in self._projects_dir.iterdir():
            if not project_dir.is_dir():
                continue
            manifest = self._read_manifest(project_dir.name)
            if manifest is None or manifest.deleted_at is not None:
                continue
            manifests.append(self._resolve_summary(manifest))
        return sorted(manifests, key=lambda summary: summary.updated_at, reverse=True)

    def get_project_detail(self, project_id: str) -> Optional[ProjectDetail]:
        manifest = self._read_manifest(project_id)
        if manifest is None or manifest.deleted_at is not None:
            return None

        summary = self._resolve_summary(manifest)
        original_result = self._read_original_result(project_id) if summary.assets.has_original_result else None
        saved_draft = draft_store.get(project_id)

        return ProjectDetail(
            projectId=summary.project_id,
            jobId=summary.job_id,
            projectName=summary.project_name,
            createdAt=summary.created_at,
            updatedAt=summary.updated_at,
            status=summary.status,
            hasSavedDraft=summary.has_saved_draft,
            draftVersion=summary.draft_version,
            assets=summary.assets,
            providerPreferences=summary.provider_preferences,
            sharePath=summary.share_path,
            upload=manifest.upload,
            originalResult=original_result,
            savedDraft=saved_draft,
            draftSavedAt=summary.draft_saved_at,
            currentStage=summary.current_stage,
            statusMessage=summary.status_message,
            error=summary.error,
            stemCount=summary.stem_count,
            trackCount=summary.track_count,
        )

    def get_completed_job_record(self, project_id: str) -> Optional[JobRecord]:
        manifest = self._read_manifest(project_id)
        if manifest is None or manifest.deleted_at is not None:
            return None

        original_result = self._read_original_result(project_id)
        if original_result is None:
            return None

        return JobRecord(
            id=manifest.summary.job_id,
            uploadId=manifest.upload.upload_id if manifest.upload is not None else manifest.summary.job_id,
            status="completed",
            createdAt=manifest.summary.created_at,
            updatedAt=manifest.summary.updated_at,
            progress=JobProgress(
                stage=manifest.current_stage or "completed",
                percent=100,
                message=manifest.status_message or "Completed project loaded from persisted storage.",
            ),
            providerPreferences=manifest.summary.provider_preferences,
            result=original_result,
            error=manifest.error,
        )

    def get_project_dir(self, project_id: str) -> Path:
        return self._project_dir(project_id)

    def get_original_result(self, project_id: str) -> Optional[JobResult]:
        return self._read_original_result(project_id)

    def namespace_draft_note_ids(self, result: JobResult, namespace: str) -> JobResult:
        return self._namespace_draft_note_ids(result, namespace)

    def find_project_id_by_path(self, path: Path) -> Optional[str]:
        try:
            resolved_path = path.resolve(strict=True)
        except FileNotFoundError:
            return None

        try:
            projects_root = self._projects_dir.resolve(strict=True)
        except FileNotFoundError:
            return None

        try:
            relative_path = resolved_path.relative_to(projects_root)
        except ValueError:
            return None

        parts = relative_path.parts
        if not parts:
            return None

        project_id = parts[0]
        manifest = self._read_manifest(project_id)
        if manifest is None or manifest.deleted_at is not None:
            return None
        return project_id

    def import_project(
        self,
        manifest: ProjectManifestRecord,
        original_result: JobResult,
        saved_draft: Optional[JobDraftRecord] = None,
    ) -> ProjectDetail:
        self._write_original_result(manifest.summary.project_id, original_result)
        self._write_manifest(manifest)
        if saved_draft is not None:
            draft_store.save_record(saved_draft)
        return self.get_project_detail(manifest.summary.project_id)

    def _resolve_summary(self, manifest: ProjectManifestRecord) -> ProjectSummary:
        saved_draft = draft_store.get(manifest.summary.job_id)
        summary = manifest.summary.model_copy(deep=True)
        summary.has_saved_draft = saved_draft is not None
        summary.draft_version = saved_draft.version if saved_draft is not None else None
        summary.draft_saved_at = saved_draft.saved_at if saved_draft is not None else None
        summary.current_stage = manifest.current_stage
        summary.status_message = manifest.status_message
        summary.error = manifest.error
        if summary.assets.has_original_result and (summary.stem_count is None or summary.track_count is None):
            original_result = self._read_original_result(summary.project_id)
            if original_result is not None:
                summary.stem_count = len(original_result.stems)
                summary.track_count = len(original_result.tracks)
        return summary

    def _apply_completed_result_summary(self, manifest: ProjectManifestRecord, result: JobResult) -> None:
        manifest.summary.project_name = result.project_name
        manifest.summary.assets.has_stems = len(result.stems) > 0
        manifest.summary.assets.has_original_result = True
        manifest.summary.assets.available_exports = ["midi", "musicxml"]
        manifest.summary.stem_count = len(result.stems)
        manifest.summary.track_count = len(result.tracks)
        manifest.summary.error = None
        manifest.summary.current_stage = manifest.current_stage
        manifest.summary.status_message = manifest.status_message

    def _write_original_result_if_missing(self, project_id: str, result: JobResult) -> None:
        if self._read_original_result(project_id) is None:
            self._write_original_result(project_id, result)

    def _build_duplicate_project_name(self, source_project_name: str) -> str:
        return f"{source_project_name} copy"

    def _namespace_draft_note_ids(self, result: JobResult, namespace: str) -> JobResult:
        return JobResult(
            projectName=result.project_name,
            bpm=result.bpm,
            stems=[stem.model_copy(deep=True) for stem in result.stems],
            tracks=[
                track.model_copy(
                    update={
                        "notes": [
                            note.model_copy(
                                update={
                                    "draft_note_id": self._build_namespaced_draft_note_id(namespace, track, note.id)
                                }
                            )
                            for note in track.notes
                        ]
                    },
                    deep=True,
                )
                for track in result.tracks
            ],
            warnings=list(result.warnings),
        )

    def _build_namespaced_draft_note_id(self, namespace: str, track, note_id: str) -> str:
        track_key = f"{track.instrument}:{track.source_stem}:{track.provider}"
        return f"draft:{namespace}:{track_key}:{note_id}"

    def _read_manifest(self, project_id: str) -> Optional[ProjectManifestRecord]:
        manifest_path = self._manifest_path(project_id)
        if not manifest_path.exists():
            return None
        with self._lock:
            return ProjectManifestRecord.model_validate_json(manifest_path.read_text(encoding="utf-8"))

    def _write_manifest(self, manifest: ProjectManifestRecord) -> None:
        with self._lock:
            project_dir = self._project_dir(manifest.summary.project_id)
            project_dir.mkdir(parents=True, exist_ok=True)
            self._manifest_path(manifest.summary.project_id).write_text(
                manifest.model_dump_json(by_alias=True, indent=2),
                encoding="utf-8",
            )

    def _read_original_result(self, project_id: str) -> Optional[JobResult]:
        result_path = self._original_result_path(project_id)
        if not result_path.exists():
            return None
        with self._lock:
            return JobResult.model_validate_json(result_path.read_text(encoding="utf-8"))

    def _write_original_result(self, project_id: str, result: JobResult) -> None:
        with self._lock:
            project_dir = self._project_dir(project_id)
            project_dir.mkdir(parents=True, exist_ok=True)
            self._original_result_path(project_id).write_text(
                result.model_dump_json(by_alias=True, indent=2),
                encoding="utf-8",
            )

    def _project_dir(self, project_id: str) -> Path:
        return self._projects_dir / project_id

    def _manifest_path(self, project_id: str) -> Path:
        return self._project_dir(project_id) / "manifest.json"

    def _original_result_path(self, project_id: str) -> Path:
        return self._project_dir(project_id) / "original-result.json"


project_store = ProjectStore(get_settings().projects_dir)
