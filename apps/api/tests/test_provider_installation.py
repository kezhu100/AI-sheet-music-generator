from __future__ import annotations

import tempfile
import time
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import Settings
from app.services.provider_installation import ProviderInstallationService


def _build_settings(root: Path) -> Settings:
    data_dir = root / "data"
    settings = Settings(
        data_dir=data_dir,
        uploads_dir=data_dir / "uploads",
        stems_dir=data_dir / "stems",
        drafts_dir=data_dir / "drafts",
        projects_dir=data_dir / "projects",
        provider_runtime_dir=data_dir / "providers",
        provider_install_logs_dir=data_dir / "providers" / "logs",
        provider_install_cache_dir=data_dir / "providers" / "cache",
        provider_install_state_file=data_dir / "providers" / "install-state.json",
        custom_provider_registry_dir=data_dir / "providers" / "custom",
        custom_provider_registry_file=data_dir / "providers" / "custom-registry.json",
        drum_transcription_ml_python=sys.executable,
    )
    for path in (
        settings.data_dir,
        settings.uploads_dir,
        settings.stems_dir,
        settings.drafts_dir,
        settings.projects_dir,
        settings.provider_runtime_dir,
        settings.provider_install_logs_dir,
        settings.provider_install_cache_dir,
        settings.custom_provider_registry_dir,
    ):
        path.mkdir(parents=True, exist_ok=True)
    return settings


class _ImmediateThread:
    def __init__(self, target, args=(), daemon=None):
        self._target = target
        self._args = args

    def start(self) -> None:
        self._target(*self._args)


class _CompletedProcess:
    def __init__(self, returncode: int, stdout: str = "", stderr: str = "") -> None:
        self.returncode = returncode
        self.stdout = stdout
        self.stderr = stderr


class ProviderInstallationTests(unittest.TestCase):
    def test_demucs_drums_install_uses_explicit_demucs_package(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            settings = _build_settings(Path(temp_dir))
            service = ProviderInstallationService(settings)

            with patch("app.services.provider_installation.Thread", _ImmediateThread), patch(
                "app.services.provider_installation.subprocess.run",
                return_value=_CompletedProcess(0, stdout="demucs install ok"),
            ) as mocked_run, patch(
                "app.services.provider_installation.check_python_module",
                side_effect=[(False, "No module named demucs"), (True, "ok")],
            ):
                response = service.start_install("demucs-drums")

            self.assertEqual(response.status, "started")
            self.assertTrue(response.install_id)
            record = service.get_install(response.install_id or "")
            self.assertIsNotNone(record)
            self.assertEqual(record.state, "completed")
            self.assertIsNotNone(record.log_path)

            commands = [call.args[0] for call in mocked_run.call_args_list]
            self.assertEqual(len(commands), 1)
            self.assertIn("demucs", commands[0])

            log_content = Path(record.log_path or "").read_text(encoding="utf-8")
            self.assertIn("attempt: demucs-drums-default-install", log_content)

    def test_demucs_drums_install_failure_reports_generic_fallback_message(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            settings = _build_settings(Path(temp_dir))
            service = ProviderInstallationService(settings)

            with patch("app.services.provider_installation.Thread", _ImmediateThread), patch(
                "app.services.provider_installation.subprocess.run",
                return_value=_CompletedProcess(1, stderr="demucs install failed"),
            ), patch(
                "app.services.provider_installation.check_python_module",
                return_value=(False, "No module named demucs"),
            ):
                response = service.start_install("demucs-drums")

            self.assertEqual(response.status, "started")
            record = service.get_install(response.install_id or "")
            self.assertIsNotNone(record)
            self.assertEqual(record.state, "failed")
            self.assertEqual(record.failure_reason, "pip_install_failed")
            self.assertIn("Install failed for Demucs Drums", record.message)
            self.assertTrue(
                any("keep Auto/default fallback provider" in step for step in record.actionable_steps),
            )


if __name__ == "__main__":
    unittest.main()
