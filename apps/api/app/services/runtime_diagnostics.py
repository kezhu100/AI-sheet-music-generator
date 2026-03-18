from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import subprocess
import sys
from typing import Iterable, Optional

from app.core.config import Settings, get_settings
from app.models.schemas import RuntimeDiagnostics, RuntimeProviderStatus, RuntimeStorageStatus
from app.pipeline.drum_transcription import (
    DRUM_TRANSCRIPTION_PROVIDER_HEURISTIC,
    DRUM_TRANSCRIPTION_PROVIDER_MADMOM,
    DRUM_TRANSCRIPTION_PROVIDER_ML,
)
from app.pipeline.piano_transcription import (
    PIANO_TRANSCRIPTION_PROVIDER_BASIC_PITCH,
    PIANO_TRANSCRIPTION_PROVIDER_HEURISTIC,
    PIANO_TRANSCRIPTION_PROVIDER_ML,
)
from app.pipeline.source_separation import SOURCE_SEPARATION_PROVIDER_DEVELOPMENT, SOURCE_SEPARATION_PROVIDER_DEMUCS


@dataclass(frozen=True)
class RuntimeDiagnosticsResult:
    diagnostics: RuntimeDiagnostics

    @property
    def is_blocking(self) -> bool:
        return self.diagnostics.severity == "blocking"


class RuntimeDiagnosticsService:
    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings

    def collect(self) -> RuntimeDiagnosticsResult:
        settings = self._settings or get_settings()
        storage = self._build_storage_statuses()
        providers = [
            self._build_source_separation_status(settings),
            self._build_piano_status(settings),
            self._build_drum_status(settings),
        ]
        constraints = [
            "This app is local-first and expects the browser UI and API to run on the same machine.",
            "Stable project routes are local deployment routes only; they are not cloud share links or public publishing tokens.",
            "Projects, uploads, stems, and drafts stay on the local filesystem for this deployment.",
            "Cloud sync, multi-device sync, accounts, and background job recovery after API restart are not implemented.",
        ]

        blocking = any(not item.ready for item in storage) or any(provider.status == "blocking-misconfigured" for provider in providers)
        degraded = any(provider.status == "degraded-fallback" for provider in providers)

        if blocking:
            severity = "blocking"
            ready = False
            summary = "Local app startup is blocked by a required runtime or provider configuration issue."
        elif degraded:
            severity = "degraded"
            ready = True
            summary = "Local app startup is ready, but one or more configured providers will run in degraded fallback mode."
        else:
            severity = "ready"
            ready = True
            summary = "Local app runtime is ready."

        return RuntimeDiagnosticsResult(
            diagnostics=RuntimeDiagnostics(
                severity=severity,
                ready=ready,
                summary=summary,
                storage=storage,
                providers=providers,
                constraints=constraints,
            )
        )

    def _build_storage_statuses(self) -> list[RuntimeStorageStatus]:
        settings = self._settings or get_settings()
        return [
            self._storage_status("uploads", "Uploads", settings.uploads_dir),
            self._storage_status("stems", "Stems", settings.stems_dir),
            self._storage_status("drafts", "Drafts", settings.drafts_dir),
            self._storage_status("projects", "Projects", settings.projects_dir),
        ]

    def _storage_status(self, key: str, label: str, path: Path) -> RuntimeStorageStatus:
        ready = path.exists() and path.is_dir()
        message = (
            f"{label} directory is available for local filesystem persistence."
            if ready
            else f"{label} directory is missing or not accessible: {path}"
        )
        return RuntimeStorageStatus(key=key, label=label, path=str(path), ready=ready, message=message)

    def _build_source_separation_status(self, settings: Settings) -> RuntimeProviderStatus:
        selected = settings.source_separation_provider
        fallback = settings.source_separation_fallback_provider
        if selected == SOURCE_SEPARATION_PROVIDER_DEVELOPMENT:
            return RuntimeProviderStatus(
                key="source-separation",
                label="Source separation",
                selectedProvider=selected,
                selectedProviderLabel="Development copy",
                fallbackProvider=fallback,
                fallbackProviderLabel=self._source_provider_label(fallback),
                status="ready",
                message="The local development copy provider is available and keeps the app runnable without optional ML runtimes.",
                guidance=[],
                optional=False,
            )

        if selected == SOURCE_SEPARATION_PROVIDER_DEMUCS:
            return self._build_python_provider_status(
                key="source-separation",
                label="Source separation",
                selected_provider=selected,
                selected_label="Demucs",
                fallback_provider=fallback,
                fallback_label=self._source_provider_label(fallback),
                python_executable=settings.source_separation_demucs_python,
                module_name="demucs",
                optional_when_unselected=True,
                install_guidance=[
                    "Install Demucs into the configured Python environment or switch SOURCE_SEPARATION_PROVIDER back to development-copy.",
                    "Set SOURCE_SEPARATION_FALLBACK_PROVIDER=development-copy to keep startup non-blocking when Demucs is unavailable.",
                ],
            )

        return self._unsupported_provider_status("source-separation", "Source separation", selected, fallback, self._source_provider_label)

    def _build_piano_status(self, settings: Settings) -> RuntimeProviderStatus:
        selected = settings.piano_transcription_provider
        fallback = settings.piano_transcription_fallback_provider
        if selected == PIANO_TRANSCRIPTION_PROVIDER_HEURISTIC:
            return RuntimeProviderStatus(
                key="piano-transcription",
                label="Piano transcription",
                selectedProvider=selected,
                selectedProviderLabel="Heuristic WAV",
                fallbackProvider=fallback,
                fallbackProviderLabel=self._piano_provider_label(fallback),
                status="ready",
                message="The heuristic piano provider is available without optional ML runtimes.",
                guidance=[],
                optional=False,
            )

        if selected in {PIANO_TRANSCRIPTION_PROVIDER_ML, PIANO_TRANSCRIPTION_PROVIDER_BASIC_PITCH}:
            return self._build_python_provider_status(
                key="piano-transcription",
                label="Piano transcription",
                selected_provider=selected,
                selected_label="Basic Pitch",
                fallback_provider=fallback,
                fallback_label=self._piano_provider_label(fallback),
                python_executable=settings.piano_transcription_ml_python,
                module_name="basic_pitch",
                optional_when_unselected=True,
                install_guidance=[
                    "Install Basic Pitch into the configured Python environment or switch PIANO_TRANSCRIPTION_PROVIDER back to heuristic.",
                    "Set PIANO_TRANSCRIPTION_FALLBACK_PROVIDER=heuristic to keep startup non-blocking when Basic Pitch is unavailable.",
                ],
            )

        return self._unsupported_provider_status("piano-transcription", "Piano transcription", selected, fallback, self._piano_provider_label)

    def _build_drum_status(self, settings: Settings) -> RuntimeProviderStatus:
        selected = settings.drum_transcription_provider
        fallback = settings.drum_transcription_fallback_provider
        if selected == DRUM_TRANSCRIPTION_PROVIDER_HEURISTIC:
            return RuntimeProviderStatus(
                key="drum-transcription",
                label="Drum transcription",
                selectedProvider=selected,
                selectedProviderLabel="Heuristic WAV",
                fallbackProvider=fallback,
                fallbackProviderLabel=self._drum_provider_label(fallback),
                status="ready",
                message="The heuristic drum provider is available without optional ML runtimes.",
                guidance=[],
                optional=False,
            )

        if selected in {DRUM_TRANSCRIPTION_PROVIDER_ML, DRUM_TRANSCRIPTION_PROVIDER_MADMOM}:
            return self._build_python_provider_status(
                key="drum-transcription",
                label="Drum transcription",
                selected_provider=selected,
                selected_label="madmom",
                fallback_provider=fallback,
                fallback_label=self._drum_provider_label(fallback),
                python_executable=settings.drum_transcription_ml_python,
                module_name="madmom",
                optional_when_unselected=True,
                install_guidance=[
                    "Install madmom into the configured Python environment or switch DRUM_TRANSCRIPTION_PROVIDER back to heuristic.",
                    "Set DRUM_TRANSCRIPTION_FALLBACK_PROVIDER=heuristic to keep startup non-blocking when madmom is unavailable.",
                ],
            )

        return self._unsupported_provider_status("drum-transcription", "Drum transcription", selected, fallback, self._drum_provider_label)

    def _build_python_provider_status(
        self,
        *,
        key: str,
        label: str,
        selected_provider: str,
        selected_label: str,
        fallback_provider: Optional[str],
        fallback_label: Optional[str],
        python_executable: Optional[str],
        module_name: str,
        optional_when_unselected: bool,
        install_guidance: Iterable[str],
    ) -> RuntimeProviderStatus:
        executable = python_executable or sys.executable
        provider_available, detail = self._check_python_module(executable, module_name)
        guidance = list(install_guidance)

        if provider_available:
            return RuntimeProviderStatus(
                key=key,
                label=label,
                selectedProvider=selected_provider,
                selectedProviderLabel=selected_label,
                fallbackProvider=fallback_provider,
                fallbackProviderLabel=fallback_label,
                status="ready",
                message=f"{selected_label} is available in the configured Python runtime.",
                guidance=[],
                optional=optional_when_unselected,
            )

        has_fallback = fallback_provider is not None and fallback_provider != selected_provider
        if has_fallback:
            return RuntimeProviderStatus(
                key=key,
                label=label,
                selectedProvider=selected_provider,
                selectedProviderLabel=selected_label,
                fallbackProvider=fallback_provider,
                fallbackProviderLabel=fallback_label,
                status="degraded-fallback",
                message=(
                    f"{selected_label} is unavailable in the configured Python runtime, so the app can start in degraded mode by falling back to "
                    f"{fallback_label or fallback_provider}. Details: {detail}"
                ),
                guidance=guidance,
                optional=optional_when_unselected,
            )

        return RuntimeProviderStatus(
            key=key,
            label=label,
            selectedProvider=selected_provider,
            selectedProviderLabel=selected_label,
            fallbackProvider=fallback_provider,
            fallbackProviderLabel=fallback_label,
            status="blocking-misconfigured",
            message=f"{selected_label} is configured as the primary provider but is unavailable. Details: {detail}",
            guidance=guidance,
            optional=optional_when_unselected,
        )

    def _check_python_module(self, python_executable: str, module_name: str) -> tuple[bool, str]:
        executable_path = Path(python_executable)
        if not executable_path.exists():
            return False, f"Python executable was not found at '{python_executable}'."

        command = [python_executable, "-c", f"import {module_name}"]
        try:
            completed = subprocess.run(command, check=False, capture_output=True, text=True)
        except OSError as exc:
            return False, f"Could not run '{python_executable}': {exc}"

        if completed.returncode == 0:
            return True, "ok"

        detail = completed.stderr.strip() or completed.stdout.strip() or f"exit code {completed.returncode}"
        return False, detail

    def _unsupported_provider_status(
        self,
        key: str,
        label: str,
        selected: str,
        fallback: Optional[str],
        label_resolver,
    ) -> RuntimeProviderStatus:
        return RuntimeProviderStatus(
            key=key,
            label=label,
            selectedProvider=selected,
            selectedProviderLabel=selected,
            fallbackProvider=fallback,
            fallbackProviderLabel=label_resolver(fallback),
            status="blocking-misconfigured",
            message=f"Unsupported provider '{selected}' is configured.",
            guidance=["Update the provider environment variable to one of the documented supported providers."],
            optional=False,
        )

    def _source_provider_label(self, provider: Optional[str]) -> Optional[str]:
        mapping = {
            SOURCE_SEPARATION_PROVIDER_DEVELOPMENT: "Development copy",
            SOURCE_SEPARATION_PROVIDER_DEMUCS: "Demucs",
        }
        return mapping.get(provider, provider) if provider else None

    def _piano_provider_label(self, provider: Optional[str]) -> Optional[str]:
        mapping = {
            PIANO_TRANSCRIPTION_PROVIDER_HEURISTIC: "Heuristic WAV",
            PIANO_TRANSCRIPTION_PROVIDER_ML: "Basic Pitch",
            PIANO_TRANSCRIPTION_PROVIDER_BASIC_PITCH: "Basic Pitch",
        }
        return mapping.get(provider, provider) if provider else None

    def _drum_provider_label(self, provider: Optional[str]) -> Optional[str]:
        mapping = {
            DRUM_TRANSCRIPTION_PROVIDER_HEURISTIC: "Heuristic WAV",
            DRUM_TRANSCRIPTION_PROVIDER_ML: "madmom",
            DRUM_TRANSCRIPTION_PROVIDER_MADMOM: "madmom",
        }
        return mapping.get(provider, provider) if provider else None


runtime_diagnostics_service = RuntimeDiagnosticsService()
