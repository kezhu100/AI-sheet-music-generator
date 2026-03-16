from __future__ import annotations

import subprocess
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

from app.core.config import Settings
from app.pipeline.interfaces import SourceSeparationProvider, SourceSeparationRunResult, SourceStem
from app.services.storage import persist_stem_copy, persist_stem_file, resolve_project_path

SOURCE_SEPARATION_PROVIDER_DEVELOPMENT = "development-copy"
SOURCE_SEPARATION_PROVIDER_DEMUCS = "demucs"


class SourceSeparationProviderError(RuntimeError):
    pass


class LocalDevelopmentSourceSeparationProvider(SourceSeparationProvider):
    provider_name = "local-development-separation"

    def separate(self, audio_path: Path, job_id: str) -> SourceSeparationRunResult:
        stem_specs = [
            ("piano_stem", "piano"),
            ("drum_stem", "drums"),
        ]

        stems: list[SourceStem] = []
        for stem_name, instrument_hint in stem_specs:
            stem_asset = persist_stem_copy(
                source_path=audio_path,
                job_id=job_id,
                stem_name=stem_name,
                instrument_hint=instrument_hint,
                provider=self.provider_name,
            )
            stems.append(
                SourceStem(
                    stem_name=stem_name,
                    instrument_hint=instrument_hint,
                    file_path=resolve_project_path(stem_asset.stored_path),
                    stem_asset=stem_asset,
                )
            )

        return SourceSeparationRunResult(
            provider_name=self.provider_name,
            stems=stems,
            warnings=[
                "Source separation ran with the development copy provider, so the uploaded file was duplicated into placeholder stems instead of being truly separated.",
            ],
        )


class DemucsSourceSeparationProvider(SourceSeparationProvider):
    provider_name = "demucs-separation"

    def __init__(
        self,
        *,
        python_executable: str | None = None,
        model_name: str = "htdemucs",
        device: str | None = None,
        piano_source_name: str = "other",
        drums_source_name: str = "drums",
    ) -> None:
        self._python_executable = python_executable or sys.executable
        self._model_name = model_name
        self._device = device
        self._piano_source_name = piano_source_name
        self._drums_source_name = drums_source_name

    def separate(self, audio_path: Path, job_id: str) -> SourceSeparationRunResult:
        with TemporaryDirectory() as temp_dir:
            output_dir = Path(temp_dir) / "demucs-output"
            command = [
                self._python_executable,
                "-m",
                "demucs.separate",
                "-n",
                self._model_name,
                "-o",
                str(output_dir),
            ]
            if self._device:
                command.extend(["-d", self._device])
            command.append(str(audio_path))

            try:
                completed = subprocess.run(
                    command,
                    check=False,
                    capture_output=True,
                    text=True,
                )
            except FileNotFoundError as exc:
                raise SourceSeparationProviderError(
                    f"Demucs Python executable was not found at '{self._python_executable}'."
                ) from exc

            if completed.returncode != 0:
                detail = completed.stderr.strip() or completed.stdout.strip() or "unknown error"
                raise SourceSeparationProviderError(
                    f"Demucs separation failed with exit code {completed.returncode}: {detail}"
                )

            drums_source = self._find_demucs_output(output_dir, self._drums_source_name)
            piano_source = self._find_demucs_output(output_dir, self._piano_source_name)

            stem_specs = [
                ("piano_stem", "piano", piano_source),
                ("drum_stem", "drums", drums_source),
            ]

            stems: list[SourceStem] = []
            for stem_name, instrument_hint, source_path in stem_specs:
                stem_asset = persist_stem_file(
                    source_path=source_path,
                    job_id=job_id,
                    stem_name=stem_name,
                    instrument_hint=instrument_hint,
                    provider=self.provider_name,
                )
                stems.append(
                    SourceStem(
                        stem_name=stem_name,
                        instrument_hint=instrument_hint,
                        file_path=resolve_project_path(stem_asset.stored_path),
                        stem_asset=stem_asset,
                    )
                )

        warnings = [
            f"Source separation ran with Demucs model '{self._model_name}'.",
        ]
        if self._piano_source_name != "piano":
            warnings.append(
                f"The normalized piano stem currently maps from Demucs '{self._piano_source_name}' output, so it may still contain non-piano accompaniment."
            )

        return SourceSeparationRunResult(
            provider_name=self.provider_name,
            stems=stems,
            warnings=warnings,
        )

    def _find_demucs_output(self, output_dir: Path, source_name: str) -> Path:
        matches = sorted(output_dir.rglob(f"{source_name}.wav"))
        if not matches:
            raise SourceSeparationProviderError(
                f"Demucs completed but did not produce the expected '{source_name}.wav' output."
            )
        return matches[0]


class FallbackSourceSeparationProvider(SourceSeparationProvider):
    def __init__(self, primary: SourceSeparationProvider, fallback: SourceSeparationProvider) -> None:
        self._primary = primary
        self._fallback = fallback
        self.provider_name = primary.provider_name

    def separate(self, audio_path: Path, job_id: str) -> SourceSeparationRunResult:
        try:
            return self._primary.separate(audio_path, job_id)
        except SourceSeparationProviderError as exc:
            fallback_result = self._fallback.separate(audio_path, job_id)
            warnings = [
                f"Configured source separation provider '{self._primary.provider_name}' was unavailable, so the pipeline fell back to '{fallback_result.provider_name}': {exc}"
            ]
            warnings.extend(fallback_result.warnings)
            return SourceSeparationRunResult(
                provider_name=fallback_result.provider_name,
                stems=fallback_result.stems,
                warnings=_dedupe_warnings(warnings),
            )


def build_source_separation_provider(settings: Settings) -> SourceSeparationProvider:
    provider_id = settings.source_separation_provider
    fallback_id = settings.source_separation_fallback_provider

    primary = _create_provider(provider_id, settings)
    if fallback_id and fallback_id != provider_id:
        fallback = _create_provider(fallback_id, settings)
        return FallbackSourceSeparationProvider(primary=primary, fallback=fallback)

    return primary


def _create_provider(provider_id: str, settings: Settings) -> SourceSeparationProvider:
    if provider_id == SOURCE_SEPARATION_PROVIDER_DEVELOPMENT:
        return LocalDevelopmentSourceSeparationProvider()
    if provider_id == SOURCE_SEPARATION_PROVIDER_DEMUCS:
        return DemucsSourceSeparationProvider(
            python_executable=settings.source_separation_demucs_python,
            model_name=settings.source_separation_demucs_model,
            device=settings.source_separation_demucs_device,
            piano_source_name=settings.source_separation_demucs_piano_source,
            drums_source_name=settings.source_separation_demucs_drums_source,
        )

    raise ValueError(f"Unsupported source separation provider '{provider_id}'.")


def _dedupe_warnings(warnings: list[str]) -> list[str]:
    deduped: list[str] = []
    for warning in warnings:
        if warning not in deduped:
            deduped.append(warning)
    return deduped
