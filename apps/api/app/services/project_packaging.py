from __future__ import annotations

import io
import zipfile
from pathlib import Path, PurePosixPath
from typing import Callable, Optional
from uuid import uuid4

from fastapi import UploadFile

from app.core.config import get_settings
from app.models.schemas import (
    JobDraftRecord,
    JobResult,
    ProjectDetail,
    ProjectManifestRecord,
    ProjectPackageMetadata,
    ProjectSummary,
    UploadedFileDescriptor,
    utc_now,
)
from app.services.draft_store import draft_store
from app.services.project_store import project_store
from app.services.storage import resolve_project_path, resolve_upload_path


PACKAGE_FORMAT_VERSION = 1
PACKAGE_MANIFEST_NAME = "project-package.json"
PROJECT_MANIFEST_NAME = "manifest.json"
ORIGINAL_RESULT_NAME = "original-result.json"
SAVED_DRAFT_NAME = "saved-draft.json"
SOURCE_UPLOAD_DIR = "assets/source-upload"
STEMS_DIR = "assets/stems"
MAX_PACKAGE_ENTRY_COUNT = 128
MAX_PACKAGE_FILE_BYTES = 50 * 1024 * 1024
MAX_PACKAGE_UNCOMPRESSED_BYTES = 200 * 1024 * 1024


class ProjectPackagingError(Exception):
    pass


class ProjectPackagingService:
    def __init__(self) -> None:
        self._settings = get_settings()

    def export_project_to_path(self, project_id: str, target_path: str) -> tuple[ProjectDetail, ProjectPackageMetadata, str]:
        project = project_store.get_project_detail(project_id)
        if project is None:
            raise ProjectPackagingError("Project not found.")
        if project.original_result is None:
            raise ProjectPackagingError("Only completed persisted projects can be exported.")

        destination = Path(target_path).expanduser().resolve(strict=False)
        parent = destination.parent
        if not parent.exists():
            raise ProjectPackagingError("Target directory does not exist.")
        if not parent.is_dir():
            raise ProjectPackagingError("Target directory does not exist.")
        if destination.exists():
            raise ProjectPackagingError("File already exists. Please choose a different name.")

        metadata, package_entries = self._build_package_entries(project)
        try:
            with zipfile.ZipFile(destination, mode="w", compression=zipfile.ZIP_DEFLATED) as archive:
                for archive_name, content in package_entries.items():
                    archive.writestr(archive_name, content)
        except PermissionError as exc:
            raise ProjectPackagingError("Permission denied. Cannot write to the specified path.") from exc
        except OSError as exc:
            raise ProjectPackagingError("Export failed. Please check the path and try again.") from exc

        return project, metadata, str(destination)

    async def import_project_package_upload(self, package_file: UploadFile) -> tuple[ProjectDetail, ProjectPackageMetadata]:
        file_name = package_file.filename or "project.zip"
        if not file_name.lower().endswith(".zip"):
            raise ProjectPackagingError("Imported project package must be a .zip file.")

        package_bytes = await package_file.read()
        try:
            with zipfile.ZipFile(io.BytesIO(package_bytes), mode="r") as archive:
                self._validate_archive_names(archive)
                metadata = self._read_package_metadata(lambda name: archive.read(name).decode("utf-8"))
                manifest = self._read_manifest(lambda name: archive.read(name).decode("utf-8"))
                original_result = self._read_original_result(lambda name: archive.read(name).decode("utf-8"))
                saved_draft = self._read_saved_draft(lambda name: archive.read(name).decode("utf-8"))
                return self._import_loaded_package(
                    metadata=metadata,
                    manifest=manifest,
                    original_result=original_result,
                    saved_draft=saved_draft,
                    binary_reader=lambda name: archive.read(name),
                )
        except zipfile.BadZipFile as exc:
            raise ProjectPackagingError("Imported project package is not a valid zip file.") from exc
        except KeyError as exc:
            raise ProjectPackagingError("Imported project package is missing required files.") from exc

    def open_local_project(self, source_path: str) -> tuple[ProjectDetail, Optional[ProjectPackageMetadata]]:
        resolved_path = Path(source_path).expanduser()
        if not resolved_path.exists():
            raise ProjectPackagingError("Local project path does not exist.")
        if not resolved_path.is_dir():
            raise ProjectPackagingError("Local project path must be a directory.")

        existing_project_id = project_store.find_project_id_by_path(resolved_path)
        if existing_project_id is not None:
            project = project_store.get_project_detail(existing_project_id)
            if project is None:
                raise ProjectPackagingError("Project not found.")
            return project, None

        package_manifest_path = resolved_path / PACKAGE_MANIFEST_NAME
        if package_manifest_path.exists():
            metadata = self._read_package_metadata(lambda name: (resolved_path / name).read_text(encoding="utf-8"))
            manifest = self._read_manifest(lambda name: (resolved_path / name).read_text(encoding="utf-8"))
            original_result = self._read_original_result(lambda name: (resolved_path / name).read_text(encoding="utf-8"))
            saved_draft = self._read_saved_draft(lambda name: (resolved_path / name).read_text(encoding="utf-8"))
            return self._import_loaded_package(
                metadata=metadata,
                manifest=manifest,
                original_result=original_result,
                saved_draft=saved_draft,
                binary_reader=lambda name: (resolved_path / name).read_bytes(),
                source_root=resolved_path,
            )

        manifest_path = resolved_path / PROJECT_MANIFEST_NAME
        original_result_path = resolved_path / ORIGINAL_RESULT_NAME
        if not manifest_path.exists() or not original_result_path.exists():
            raise ProjectPackagingError("Local project folder must include manifest.json and original-result.json.")

        manifest = ProjectManifestRecord.model_validate_json(manifest_path.read_text(encoding="utf-8"))
        original_result = JobResult.model_validate_json(original_result_path.read_text(encoding="utf-8"))
        saved_draft_path = resolved_path / SAVED_DRAFT_NAME
        saved_draft = (
            JobDraftRecord.model_validate_json(saved_draft_path.read_text(encoding="utf-8"))
            if saved_draft_path.exists()
            else None
        )
        metadata = ProjectPackageMetadata(
            formatVersion=PACKAGE_FORMAT_VERSION,
            sourceProjectId=manifest.summary.project_id,
            sourceJobId=manifest.summary.job_id,
            exportedAt=utc_now(),
            includesSavedDraft=saved_draft is not None,
            includesSourceUpload=False,
            includedStemCount=0,
        )
        return self._import_loaded_package(
            metadata=metadata,
            manifest=manifest,
            original_result=original_result,
            saved_draft=saved_draft,
            binary_reader=lambda name: (resolved_path / name).read_bytes(),
            source_root=resolved_path,
            allow_missing_package_manifest=True,
        )

    def _build_package_entries(self, project: ProjectDetail) -> tuple[ProjectPackageMetadata, dict[str, bytes]]:
        if project.original_result is None:
            raise ProjectPackagingError("Project original result is not available for packaging.")

        entries: dict[str, bytes] = {}
        saved_draft = draft_store.get(project.job_id)
        included_stem_count = 0
        includes_source_upload = False

        manifest_payload = ProjectManifestRecord(
            summary=ProjectSummary(
                projectId=project.project_id,
                jobId=project.job_id,
                projectName=project.project_name,
                createdAt=project.created_at,
                updatedAt=project.updated_at,
                status=project.status,
                hasSavedDraft=project.has_saved_draft,
                draftVersion=project.draft_version,
                draftSavedAt=project.draft_saved_at,
                assets=project.assets.model_copy(deep=True),
                sharePath=project.share_path,
                currentStage=project.current_stage,
                statusMessage=project.status_message,
                error=project.error,
                stemCount=project.stem_count,
                trackCount=project.track_count,
            ),
            upload=project.upload,
            currentStage=project.current_stage,
            statusMessage=project.status_message,
            error=project.error,
            draftSavedAt=project.draft_saved_at,
        )
        entries[PROJECT_MANIFEST_NAME] = manifest_payload.model_dump_json(by_alias=True, indent=2).encode("utf-8")
        entries[ORIGINAL_RESULT_NAME] = project.original_result.model_dump_json(by_alias=True, indent=2).encode("utf-8")
        if saved_draft is not None:
            entries[SAVED_DRAFT_NAME] = saved_draft.model_dump_json(by_alias=True, indent=2).encode("utf-8")

        if project.upload is not None:
            upload_path = resolve_upload_path(project.upload.stored_path)
            if upload_path.exists() and upload_path.is_file():
                entries[f"{SOURCE_UPLOAD_DIR}/{project.upload.file_name}"] = upload_path.read_bytes()
                includes_source_upload = True

        for stem in project.original_result.stems:
            stem_path = resolve_project_path(stem.stored_path)
            if stem_path.exists() and stem_path.is_file():
                entries[self._build_stem_archive_name(stem.stem_name, stem.file_name)] = stem_path.read_bytes()
                included_stem_count += 1

        metadata = ProjectPackageMetadata(
            formatVersion=PACKAGE_FORMAT_VERSION,
            sourceProjectId=project.project_id,
            sourceJobId=project.job_id,
            exportedAt=utc_now(),
            includesSavedDraft=saved_draft is not None,
            includesSourceUpload=includes_source_upload,
            includedStemCount=included_stem_count,
        )
        entries[PACKAGE_MANIFEST_NAME] = metadata.model_dump_json(by_alias=True, indent=2).encode("utf-8")
        return metadata, entries

    def _import_loaded_package(
        self,
        *,
        metadata: ProjectPackageMetadata,
        manifest: ProjectManifestRecord,
        original_result: JobResult,
        saved_draft: Optional[JobDraftRecord],
        binary_reader: Callable[[str], bytes],
        source_root: Optional[Path] = None,
        allow_missing_package_manifest: bool = False,
    ) -> tuple[ProjectDetail, ProjectPackageMetadata]:
        if manifest.summary.status != "completed" or original_result is None:
            raise ProjectPackagingError("Only completed persisted projects can be imported.")

        new_project_id = uuid4().hex
        now = utc_now()

        restored_upload = self._restore_upload(manifest.upload, binary_reader, new_project_id, source_root)
        restored_stems, import_warnings = self._restore_stems(original_result, binary_reader, new_project_id, source_root)
        if manifest.upload is not None and restored_upload is None:
            import_warnings.append(
                "Imported project does not include the original source upload asset in local storage."
            )

        imported_original = self._build_imported_result(
            result=original_result,
            restored_stems=restored_stems,
            warning_messages=import_warnings,
        )

        imported_saved_draft = None
        if saved_draft is not None:
            imported_saved_draft = JobDraftRecord(
                jobId=new_project_id,
                version=1,
                savedAt=now,
                result=self._build_imported_result(
                    result=project_store.namespace_draft_note_ids(saved_draft.result, new_project_id),
                    restored_stems=restored_stems,
                    warning_messages=import_warnings,
                ),
            )

        imported_manifest = ProjectManifestRecord(
            summary=ProjectSummary(
                projectId=new_project_id,
                jobId=new_project_id,
                projectName=manifest.summary.project_name,
                createdAt=now,
                updatedAt=now,
                status="completed",
                hasSavedDraft=imported_saved_draft is not None,
                draftVersion=1 if imported_saved_draft is not None else None,
                draftSavedAt=now if imported_saved_draft is not None else None,
                assets={
                    "hasSourceUpload": restored_upload is not None,
                    "hasStems": len(restored_stems) > 0,
                    "hasOriginalResult": True,
                    "availableExports": ["midi", "musicxml"],
                },
                sharePath=f"/projects/{new_project_id}",
                currentStage="completed",
                statusMessage="Imported from a portable local project package." if not allow_missing_package_manifest else "Imported from a local project folder.",
                error=None,
                stemCount=len(restored_stems),
                trackCount=len(imported_original.tracks),
            ),
            upload=restored_upload,
            currentStage="completed",
            statusMessage="Imported from a portable local project package." if not allow_missing_package_manifest else "Imported from a local project folder.",
            error=None,
            draftSavedAt=now if imported_saved_draft is not None else None,
        )

        imported_project = project_store.import_project(
            manifest=imported_manifest,
            original_result=imported_original,
            saved_draft=imported_saved_draft,
        )
        return imported_project, metadata

    def _restore_upload(
        self,
        upload: Optional[UploadedFileDescriptor],
        binary_reader: Callable[[str], bytes],
        project_id: str,
        source_root: Optional[Path],
    ) -> Optional[UploadedFileDescriptor]:
        if upload is None:
            return None

        upload_bytes = self._read_optional_binary(
            archive_name=f"{SOURCE_UPLOAD_DIR}/{upload.file_name}",
            binary_reader=binary_reader,
            fallback_source_path=self._resolve_fallback_source_path(upload.stored_path, source_root),
        )
        if upload_bytes is None:
            return None

        destination = self._build_unique_file_path(self._settings.uploads_dir, f"{project_id}_{upload.file_name}")
        destination.write_bytes(upload_bytes)
        return UploadedFileDescriptor(
            uploadId=project_id,
            fileName=upload.file_name,
            contentType=upload.content_type,
            sizeBytes=destination.stat().st_size,
            storedPath=str(destination.relative_to(self._settings.project_root)).replace("\\", "/"),
            createdAt=utc_now(),
        )

    def _restore_stems(
        self,
        original_result: JobResult,
        binary_reader: Callable[[str], bytes],
        project_id: str,
        source_root: Optional[Path],
    ) -> tuple[list, list[str]]:
        restored_stems = []
        missing_stem_names: list[str] = []
        stem_root = self._settings.stems_dir / project_id
        stem_root.mkdir(parents=True, exist_ok=True)

        for stem in original_result.stems:
            stem_bytes = self._read_optional_binary(
                archive_name=self._build_stem_archive_name(stem.stem_name, stem.file_name),
                binary_reader=binary_reader,
                fallback_source_path=self._resolve_fallback_source_path(stem.stored_path, source_root),
            )
            if stem_bytes is None:
                missing_stem_names.append(stem.stem_name)
                continue

            destination = self._build_unique_file_path(stem_root, stem.file_name)
            destination.write_bytes(stem_bytes)
            restored_stems.append(
                stem.model_copy(
                    update={
                        "stored_path": str(destination.relative_to(self._settings.project_root)).replace("\\", "/"),
                        "size_bytes": destination.stat().st_size,
                    }
                )
            )

        warnings: list[str] = []
        if missing_stem_names:
            warnings.append(
                "Imported project is missing some persisted stem assets, so region re-transcription may be unavailable for those stems."
            )
        return restored_stems, warnings

    def _build_imported_result(self, *, result: JobResult, restored_stems: list, warning_messages: list[str]) -> JobResult:
        warnings = list(result.warnings)
        for warning in warning_messages:
            if warning not in warnings:
                warnings.append(warning)
        return JobResult(
            projectName=result.project_name,
            bpm=result.bpm,
            stems=restored_stems,
            tracks=[track.model_copy(deep=True) for track in result.tracks],
            warnings=warnings,
        )

    def _read_package_metadata(self, text_reader: Callable[[str], str]) -> ProjectPackageMetadata:
        try:
            metadata = ProjectPackageMetadata.model_validate_json(text_reader(PACKAGE_MANIFEST_NAME))
        except FileNotFoundError as exc:
            raise ProjectPackagingError("Project package is missing project-package.json.") from exc
        if metadata.format_version != PACKAGE_FORMAT_VERSION:
            raise ProjectPackagingError(
                f"Unsupported project package version {metadata.format_version}. Expected version {PACKAGE_FORMAT_VERSION}."
            )
        return metadata

    def _read_manifest(self, text_reader: Callable[[str], str]) -> ProjectManifestRecord:
        try:
            return ProjectManifestRecord.model_validate_json(text_reader(PROJECT_MANIFEST_NAME))
        except FileNotFoundError as exc:
            raise ProjectPackagingError("Project package is missing manifest.json.") from exc

    def _read_original_result(self, text_reader: Callable[[str], str]) -> JobResult:
        try:
            return JobResult.model_validate_json(text_reader(ORIGINAL_RESULT_NAME))
        except FileNotFoundError as exc:
            raise ProjectPackagingError("Project package is missing original-result.json.") from exc

    def _read_saved_draft(self, text_reader: Callable[[str], str]) -> Optional[JobDraftRecord]:
        try:
            return JobDraftRecord.model_validate_json(text_reader(SAVED_DRAFT_NAME))
        except (FileNotFoundError, KeyError):
            return None

    def _read_optional_binary(
        self,
        *,
        archive_name: str,
        binary_reader: Callable[[str], bytes],
        fallback_source_path: Optional[Path],
    ) -> Optional[bytes]:
        try:
            return binary_reader(archive_name)
        except (FileNotFoundError, KeyError):
            if fallback_source_path is not None and fallback_source_path.exists() and fallback_source_path.is_file():
                return fallback_source_path.read_bytes()
            return None

    def _resolve_fallback_source_path(self, stored_path: str, source_root: Optional[Path]) -> Optional[Path]:
        if source_root is not None:
            resolved_source_root = source_root.resolve(strict=True)
            stored_path_value = self._validate_manifest_asset_path(stored_path, resolved_source_root)

            candidate_paths = [
                resolved_source_root / Path(stored_path_value).name,
                resolved_source_root / stored_path_value,
            ]
            for candidate in candidate_paths:
                resolved_candidate = self._resolve_candidate_within_root(candidate, resolved_source_root)
                if resolved_candidate is not None:
                    return resolved_candidate

        project_root_candidate = self._settings.project_root / stored_path
        try:
            if project_root_candidate.exists():
                return project_root_candidate
        except OSError:
            return None
        return None

    def _validate_manifest_asset_path(self, stored_path: str, source_root: Path) -> str:
        trimmed_path = stored_path.strip()
        if not trimmed_path:
            raise ProjectPackagingError("Invalid manifest asset path: path must not be empty.")

        manifest_asset_path = Path(trimmed_path)
        if manifest_asset_path.is_absolute():
            raise ProjectPackagingError(
                "Invalid manifest asset path: asset paths must stay within the selected local project folder."
            )

        resolved_manifest_path = (source_root / manifest_asset_path).resolve(strict=False)
        try:
            resolved_manifest_path.relative_to(source_root)
        except ValueError as exc:
            raise ProjectPackagingError(
                "Invalid manifest asset path: asset paths must stay within the selected local project folder."
            ) from exc

        return trimmed_path

    def _resolve_candidate_within_root(self, candidate: Path, source_root: Path) -> Optional[Path]:
        try:
            resolved_candidate = candidate.resolve(strict=False)
            resolved_candidate.relative_to(source_root)
        except (OSError, ValueError):
            return None

        try:
            if resolved_candidate.exists():
                return resolved_candidate
        except OSError:
            return None

        return None

    def _build_stem_archive_name(self, stem_name: str, file_name: str) -> str:
        return f"{STEMS_DIR}/{stem_name}/{file_name}"

    def _validate_archive_names(self, archive: zipfile.ZipFile) -> None:
        if len(archive.infolist()) > MAX_PACKAGE_ENTRY_COUNT:
            raise ProjectPackagingError("Project package contains too many files.")

        total_uncompressed_bytes = 0
        for info in archive.infolist():
            archive_path = PurePosixPath(info.filename)
            if archive_path.is_absolute():
                raise ProjectPackagingError("Project package contains unsafe absolute paths.")
            if any(part in {"..", ""} for part in archive_path.parts):
                raise ProjectPackagingError("Project package contains unsafe path traversal entries.")
            if info.file_size > MAX_PACKAGE_FILE_BYTES:
                raise ProjectPackagingError("Project package contains a file that exceeds the size limit.")
            total_uncompressed_bytes += info.file_size
            if total_uncompressed_bytes > MAX_PACKAGE_UNCOMPRESSED_BYTES:
                raise ProjectPackagingError("Project package exceeds the allowed uncompressed size limit.")

    def _build_unique_file_path(self, parent_dir: Path, file_name: str) -> Path:
        candidate = parent_dir / file_name
        if not candidate.exists():
            return candidate

        stem = Path(file_name).stem or "asset"
        suffix = Path(file_name).suffix
        counter = 1
        while True:
            candidate = parent_dir / f"{stem}-{counter}{suffix}"
            if not candidate.exists():
                return candidate
            counter += 1


project_packaging_service = ProjectPackagingService()
