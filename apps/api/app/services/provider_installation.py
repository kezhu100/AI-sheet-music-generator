from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import json
from pathlib import Path
import subprocess
import sys
from threading import Lock, Thread
from typing import Dict, Optional
from uuid import uuid4

from app.core.config import Settings, get_settings
from app.models.schemas import (
    CustomProviderInstallActionResponse,
    CustomProviderInstallRequest,
    ProviderCategory,
    ProviderInstallActionResponse,
    ProviderInstallRecord,
)
from app.services.custom_provider_registry import (
    CustomProviderValidationError,
    custom_provider_registry_service,
)
from app.services.provider_manifest import (
    PROVIDER_CATEGORY_DRUM_TRANSCRIPTION,
    PROVIDER_CATEGORY_PIANO_TRANSCRIPTION,
    PROVIDER_CATEGORY_SOURCE_SEPARATION,
    ProviderCapabilityManifest,
    get_official_enhanced_manifest,
)
from app.services.python_runtime_probe import check_python_module


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass(frozen=True)
class _FailureDescriptor:
    reason: str
    message: str
    actionable_steps: tuple[str, ...]


@dataclass(frozen=True)
class _InstallCommandPlan:
    label: str
    pip_args: tuple[str, ...]


@dataclass(frozen=True)
class _InstallAttemptPlan:
    label: str
    commands: tuple[_InstallCommandPlan, ...]


class ProviderInstallationService:
    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings
        self._lock = Lock()
        self._records: Dict[str, ProviderInstallRecord] = {}
        self._load_records()

    def start_install(self, provider_id: str, force_reinstall: bool = False) -> ProviderInstallActionResponse:
        manifest = get_official_enhanced_manifest(provider_id)
        if manifest is None:
            return ProviderInstallActionResponse(
                status="failed",
                providerId=provider_id,
                message=f"Provider '{provider_id}' is not an installable optional enhanced provider.",
                failureReason="unknown_provider",
                actionableSteps=[
                    "Use one of the known optional enhanced provider ids: demucs, basic-pitch, demucs-drums.",
                ],
            )

        settings = self._settings or get_settings()
        python_executable = self._python_executable_for_category(manifest.category, settings)
        python_path = Path(python_executable)
        if not python_path.exists():
            return ProviderInstallActionResponse(
                status="failed",
                providerId=provider_id,
                category=manifest.category,
                message=f"Install failed because the configured Python runtime does not exist: {python_executable}",
                failureReason="python_not_found",
                actionableSteps=[
                    f"Update the configured runtime path for {manifest.category}.",
                    "Or switch the provider to built-in/Auto to keep fallback behavior.",
                ],
            )

        already_installed, _ = check_python_module(python_executable, manifest.module_name or "")
        if already_installed and not force_reinstall:
            return ProviderInstallActionResponse(
                status="completed",
                providerId=provider_id,
                category=manifest.category,
                message=f"{manifest.display_name} is already installed in the configured local Python runtime.",
                actionableSteps=[],
            )

        install_id = str(uuid4())
        now = _utc_now()
        record = ProviderInstallRecord(
            installId=install_id,
            providerId=provider_id,
            category=manifest.category,
            providerLayer=manifest.provider_layer,
            state="started",
            startedAt=now,
            updatedAt=now,
            completedAt=None,
            message=f"Install started for {manifest.display_name}.",
            failureReason=None,
            actionableSteps=[],
            logPath=None,
        )
        with self._lock:
            self._records[install_id] = record
            self._persist_records_unlocked()

        worker = Thread(
            target=self._run_install,
            args=(install_id, manifest, python_executable),
            daemon=True,
        )
        worker.start()

        return ProviderInstallActionResponse(
            status="started",
            providerId=provider_id,
            category=manifest.category,
            installId=install_id,
            message=f"Install started for {manifest.display_name}.",
            actionableSteps=list(manifest.actionable_steps),
        )

    def start_custom_install(self, payload: CustomProviderInstallRequest) -> CustomProviderInstallActionResponse:
        if payload.source_type != "manifest_url":
            return CustomProviderInstallActionResponse(
                status="failed",
                message="Unsupported custom provider source type.",
                failureReason="unsupported_source",
                actionableSteps=["Retry with sourceType=manifest_url and a local file:// manifest URL."],
            )

        try:
            manifest, failure = custom_provider_registry_service.validate_manifest_url(payload.manifest_url)
        except Exception as exc:
            return CustomProviderInstallActionResponse(
                status="failed",
                message=f"Custom provider install validation failed: {exc}",
                failureReason="custom_install_validation_failed",
                actionableSteps=["Retry with a supported local file:// manifest URL."],
            )

        if manifest is None:
            return CustomProviderInstallActionResponse(
                status="failed",
                message=failure.message if failure is not None else "Custom provider manifest validation failed.",
                failureReason=failure.reason if failure is not None else "manifest_validation_failed",
                actionableSteps=list(failure.actionable_steps) if failure is not None else [],
            )

        install_id = str(uuid4())
        now = _utc_now()
        record = ProviderInstallRecord(
            installId=install_id,
            providerId=manifest.provider_id,
            category=manifest.category,
            providerLayer="custom",
            state="started",
            startedAt=now,
            updatedAt=now,
            completedAt=None,
            message=f"Custom provider install started for {manifest.display_name}.",
            failureReason=None,
            actionableSteps=["The backend will validate the local manifest and copy declared local assets into app-managed storage."],
            logPath=None,
        )
        with self._lock:
            self._records[install_id] = record
            self._persist_records_unlocked()

        worker = Thread(
            target=self._run_custom_install,
            args=(install_id, payload.manifest_url, payload.force_reinstall),
            daemon=True,
        )
        worker.start()

        return CustomProviderInstallActionResponse(
            status="started",
            providerId=manifest.provider_id,
            category=manifest.category,
            installId=install_id,
            message=f"Custom provider install started for {manifest.display_name}.",
            actionableSteps=["The custom provider will be registered locally from the validated file:// manifest."],
        )

    def get_install(self, install_id: str) -> Optional[ProviderInstallRecord]:
        with self._lock:
            return self._records.get(install_id)

    def _build_install_attempts(self, manifest: ProviderCapabilityManifest) -> tuple[_InstallAttemptPlan, ...]:
        return (
            _InstallAttemptPlan(
                label=f"{manifest.id}-default-install",
                commands=(
                    _InstallCommandPlan(label=f"install-{manifest.id}", pip_args=manifest.pip_packages),
                ),
            ),
        )

    def _build_pip_install_command(
        self,
        python_executable: str,
        pip_args: tuple[str, ...],
        cache_dir: Path,
    ) -> list[str]:
        return [
            python_executable,
            "-m",
            "pip",
            "install",
            *pip_args,
            "--disable-pip-version-check",
            "--cache-dir",
            str(cache_dir),
        ]

    def _running_install_message(self, manifest: ProviderCapabilityManifest) -> str:
        return f"Installing {manifest.display_name} into the configured local Python runtime."

    def _completed_install_message(self, manifest: ProviderCapabilityManifest) -> str:
        return f"Install completed for {manifest.display_name}."

    def _build_install_failure_descriptor(
        self,
        manifest: ProviderCapabilityManifest,
        python_executable: str,
        failed_attempts: list[str],
    ) -> _FailureDescriptor:
        return _FailureDescriptor(
            reason="pip_install_failed",
            message=f"Install failed for {manifest.display_name}.",
            actionable_steps=(
                "Open the install log for details.",
                "Check local network/package index access and Python package compatibility.",
                "Retry install, or keep Auto/default fallback provider.",
            ),
        )

    def _run_install(self, install_id: str, manifest: ProviderCapabilityManifest, python_executable: str) -> None:
        settings = self._settings or get_settings()
        self._update_record(
            install_id,
            state="running",
            message=self._running_install_message(manifest),
        )

        attempt_logs: list[str] = []
        failed_attempts: list[str] = []
        attempts = self._build_install_attempts(manifest)

        for attempt in attempts:
            attempt_logs.append(f"attempt: {attempt.label}")
            attempt_succeeded = True

            for command_plan in attempt.commands:
                command = self._build_pip_install_command(
                    python_executable,
                    command_plan.pip_args,
                    settings.provider_install_cache_dir,
                )
                try:
                    completed = subprocess.run(
                        command,
                        check=False,
                        capture_output=True,
                        text=True,
                        encoding="utf-8",
                        errors="replace",
                    )
                except OSError as exc:
                    attempt_succeeded = False
                    failed_attempts.append(f"{attempt.label} ({command_plan.label})")
                    attempt_logs.append(f"command_label: {command_plan.label}")
                    attempt_logs.append(f"command_error: {exc}")
                    break

                attempt_logs.append(f"command_label: {command_plan.label}")
                attempt_logs.append(self._build_log(command, completed.stdout, completed.stderr, completed.returncode))
                if completed.returncode != 0:
                    attempt_succeeded = False
                    failed_attempts.append(f"{attempt.label} ({command_plan.label})")
                    break

            if not attempt_succeeded:
                attempt_logs.append("")
                continue

            installed, detail = check_python_module(python_executable, manifest.module_name or "")
            if installed:
                attempt_logs.append(f"post_install_validation: ok ({manifest.module_name})")
                log_path = self._write_log(install_id, "\n".join(attempt_logs).strip(), settings.provider_install_logs_dir)
                now = _utc_now()
                self._replace_record(
                    install_id,
                    state="completed",
                    updated_at=now,
                    completed_at=now,
                    message=self._completed_install_message(manifest),
                    failure_reason=None,
                    actionable_steps=[],
                    log_path=str(log_path),
                )
                return

            failed_attempts.append(f"{attempt.label} (post-install validation)")
            attempt_logs.append(f"post_install_validation: failed ({detail})")
            attempt_logs.append("")

        failure = self._build_install_failure_descriptor(manifest, python_executable, failed_attempts)
        self._mark_failed(
            install_id,
            failure,
            log_content="\n".join(attempt_logs).strip(),
            settings=settings,
        )

    def _run_custom_install(self, install_id: str, manifest_url: str, force_reinstall: bool) -> None:
        settings = self._settings or get_settings()
        self._update_record(
            install_id,
            state="running",
            message="Registering the custom provider manifest and local assets into app-managed storage.",
        )
        try:
            record, message = custom_provider_registry_service.install_from_manifest_url(
                manifest_url,
                force_reinstall=force_reinstall,
            )
        except CustomProviderValidationError as exc:
            failure = _FailureDescriptor(
                reason=exc.failure.reason,
                message=exc.failure.message,
                actionable_steps=exc.failure.actionable_steps,
            )
            self._mark_failed(
                install_id,
                failure,
                log_content=f"custom_manifest_url: {manifest_url}\nerror: {exc.failure.message}",
                settings=settings,
            )
            return
        except OSError as exc:
            failure = _FailureDescriptor(
                reason="custom_install_io_failed",
                message=f"Custom provider install failed while copying local files: {exc}",
                actionable_steps=(
                    "Verify that the manifest and asset files are readable and retry the install request.",
                ),
            )
            self._mark_failed(
                install_id,
                failure,
                log_content=f"custom_manifest_url: {manifest_url}\nerror: {exc}",
                settings=settings,
            )
            return

        log_content = "\n".join(
            [
                f"custom_manifest_url: {manifest_url}",
                f"provider_id: {record.provider_id}",
                f"category: {record.category}",
                f"manifest_path: {record.manifest_path}",
                f"asset_count: {record.asset_count}",
                message,
            ]
        )
        log_path = self._write_log(install_id, log_content, settings.provider_install_logs_dir)
        now = _utc_now()
        self._replace_record(
            install_id,
            state="completed",
            updated_at=now,
            completed_at=now,
            message=message,
            failure_reason=None,
            actionable_steps=[
                "Refresh runtime diagnostics to inspect the registered custom provider metadata.",
            ],
            log_path=str(log_path),
        )

    def _mark_failed(
        self,
        install_id: str,
        failure: _FailureDescriptor,
        *,
        log_content: str,
        settings: Settings,
    ) -> None:
        log_path = self._write_log(install_id, log_content, settings.provider_install_logs_dir)
        now = _utc_now()
        self._replace_record(
            install_id,
            state="failed",
            updated_at=now,
            completed_at=now,
            message=failure.message,
            failure_reason=failure.reason,
            actionable_steps=list(failure.actionable_steps),
            log_path=str(log_path),
        )

    def _replace_record(
        self,
        install_id: str,
        *,
        state: str,
        updated_at: datetime,
        completed_at: Optional[datetime],
        message: str,
        failure_reason: Optional[str],
        actionable_steps: list[str],
        log_path: Optional[str],
    ) -> None:
        with self._lock:
            existing = self._records.get(install_id)
            if existing is None:
                return
            self._records[install_id] = ProviderInstallRecord(
                installId=existing.install_id,
                providerId=existing.provider_id,
                category=existing.category,
                providerLayer=existing.provider_layer,
                state=state,
                startedAt=existing.started_at,
                updatedAt=updated_at,
                completedAt=completed_at,
                message=message,
                failureReason=failure_reason,
                actionableSteps=actionable_steps,
                logPath=log_path,
            )
            self._persist_records_unlocked()

    def _update_record(self, install_id: str, *, state: str, message: str) -> None:
        now = _utc_now()
        with self._lock:
            existing = self._records.get(install_id)
            if existing is None:
                return
            self._records[install_id] = ProviderInstallRecord(
                installId=existing.install_id,
                providerId=existing.provider_id,
                category=existing.category,
                providerLayer=existing.provider_layer,
                state=state,
                startedAt=existing.started_at,
                updatedAt=now,
                completedAt=existing.completed_at,
                message=message,
                failureReason=existing.failure_reason,
                actionableSteps=existing.actionable_steps,
                logPath=existing.log_path,
            )
            self._persist_records_unlocked()

    def _load_records(self) -> None:
        settings = self._settings or get_settings()
        state_file = settings.provider_install_state_file
        if not state_file.exists():
            return
        try:
            payload = json.loads(state_file.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return
        if not isinstance(payload, list):
            return
        loaded: Dict[str, ProviderInstallRecord] = {}
        for item in payload:
            try:
                record = ProviderInstallRecord.model_validate(item)
            except Exception:
                continue
            loaded[record.install_id] = record
        with self._lock:
            self._records = loaded

    def _persist_records_unlocked(self) -> None:
        settings = self._settings or get_settings()
        serialized = [record.model_dump(mode="json", by_alias=True) for record in self._records.values()]
        settings.provider_install_state_file.write_text(
            json.dumps(serialized, ensure_ascii=True, indent=2),
            encoding="utf-8",
        )

    def _python_executable_for_category(self, category: ProviderCategory, settings: Settings) -> str:
        if category == PROVIDER_CATEGORY_SOURCE_SEPARATION:
            return settings.source_separation_demucs_python or sys.executable
        if category == PROVIDER_CATEGORY_PIANO_TRANSCRIPTION:
            return settings.piano_transcription_ml_python or sys.executable
        if category == PROVIDER_CATEGORY_DRUM_TRANSCRIPTION:
            return settings.drum_transcription_ml_python or settings.source_separation_demucs_python or sys.executable
        return sys.executable

    def _write_log(self, install_id: str, content: str, logs_dir: Path) -> Path:
        logs_dir.mkdir(parents=True, exist_ok=True)
        log_path = logs_dir / f"{install_id}.log"
        log_path.write_text(content, encoding="utf-8")
        return log_path

    def _build_log(self, command: list[str], stdout: str, stderr: str, return_code: int) -> str:
        return "\n".join(
            [
                f"command: {' '.join(command)}",
                f"return_code: {return_code}",
                "stdout:",
                stdout.strip(),
                "",
                "stderr:",
                stderr.strip(),
            ]
        ).strip()


provider_installation_service = ProviderInstallationService()
