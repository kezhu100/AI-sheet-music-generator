from __future__ import annotations

from pathlib import Path
from threading import Lock
from typing import Optional

from app.core.config import get_settings
from app.models.schemas import (
    JobDraftRecord,
    JobRecord,
    JobResult,
    ProjectAssetAvailability,
    ProjectDetail,
    ProjectManifestRecord,
    ProjectSummary,
    UploadedFileDescriptor,
)
from app.services.draft_store import draft_store


class ProjectStore:
    def __init__(self, projects_dir: Path) -> None:
        self._projects_dir = projects_dir
        self._lock = Lock()
        self._projects_dir.mkdir(parents=True, exist_ok=True)

    def create_project(self, job: JobRecord, upload: UploadedFileDescriptor) -> ProjectManifestRecord:
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
                assets=ProjectAssetAvailability(
                    hasSourceUpload=True,
                    hasStems=False,
                    hasOriginalResult=False,
                    availableExports=[],
                ),
                sharePath=f"/projects/{job.id}",
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
        manifest.draft_saved_at = draft.saved_at
        self._write_manifest(manifest)
        return manifest

    def list_projects(self) -> list[ProjectSummary]:
        manifests: list[ProjectSummary] = []
        for project_dir in self._projects_dir.iterdir():
            if not project_dir.is_dir():
                continue
            manifest = self._read_manifest(project_dir.name)
            if manifest is None:
                continue
            manifests.append(self._resolve_summary(manifest))
        return sorted(manifests, key=lambda summary: summary.updated_at, reverse=True)

    def get_project_detail(self, project_id: str) -> Optional[ProjectDetail]:
        manifest = self._read_manifest(project_id)
        if manifest is None:
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
            sharePath=summary.share_path,
            upload=manifest.upload,
            originalResult=original_result,
            savedDraft=saved_draft,
            currentStage=manifest.current_stage,
            statusMessage=manifest.status_message,
            error=manifest.error,
        )

    def _resolve_summary(self, manifest: ProjectManifestRecord) -> ProjectSummary:
        saved_draft = draft_store.get(manifest.summary.job_id)
        summary = manifest.summary.model_copy(deep=True)
        summary.has_saved_draft = saved_draft is not None
        summary.draft_version = saved_draft.version if saved_draft is not None else None
        return summary

    def _apply_completed_result_summary(self, manifest: ProjectManifestRecord, result: JobResult) -> None:
        manifest.summary.project_name = result.project_name
        manifest.summary.assets.has_stems = len(result.stems) > 0
        manifest.summary.assets.has_original_result = True
        manifest.summary.assets.available_exports = ["midi", "musicxml"]

    def _write_original_result_if_missing(self, project_id: str, result: JobResult) -> None:
        if self._read_original_result(project_id) is None:
            self._write_original_result(project_id, result)

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
