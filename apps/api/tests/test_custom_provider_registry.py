from __future__ import annotations

import hashlib
import json
from pathlib import Path
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import Settings
from app.models.schemas import CustomProviderInstallRequest
from app.services.custom_provider_registry import CustomProviderRegistryService
from app.services.provider_installation import ProviderInstallationService
from app.services.runtime_diagnostics import RuntimeDiagnosticsService


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


class CustomProviderRegistryTests(unittest.TestCase):
    def test_registry_installs_local_file_manifest_and_surfaces_runtime_metadata(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            settings = _build_settings(root)
            asset_path = root / "custom-weight.bin"
            asset_path.write_bytes(b"local-custom-provider-asset")
            asset_sha = hashlib.sha256(asset_path.read_bytes()).hexdigest()
            manifest_path = root / "provider-manifest.json"
            manifest_path.write_text(
                json.dumps(
                    {
                        "schemaVersion": 1,
                        "providerId": "custom-local-demonstration",
                        "displayName": "Custom Local Demonstration",
                        "providerVersion": "0.1.0",
                        "category": "source-separation",
                        "runtimeModule": "custom_demo.runtime",
                        "assets": [
                            {
                                "name": "weights",
                                "url": asset_path.resolve().as_uri(),
                                "sha256": asset_sha,
                            }
                        ],
                    }
                ),
                encoding="utf-8",
            )

            registry_service = CustomProviderRegistryService(settings)
            record, message = registry_service.install_from_manifest_url(manifest_path.resolve().as_uri())

            self.assertEqual(record.provider_id, "custom-local-demonstration")
            self.assertEqual(record.provider_layer, "custom")
            self.assertEqual(record.asset_count, 1)
            self.assertIn("registered", message.lower())

            with patch("app.services.runtime_diagnostics.custom_provider_registry_service", registry_service):
                diagnostics = RuntimeDiagnosticsService(settings).collect().diagnostics

            source_status = next(provider for provider in diagnostics.providers if provider.key == "source-separation")
            self.assertEqual(len(source_status.custom_providers), 1)
            self.assertEqual(source_status.custom_providers[0].provider_id, "custom-local-demonstration")
            self.assertEqual(source_status.custom_providers[0].provider_layer, "custom")
            self.assertFalse(source_status.custom_providers[0].available)

    def test_custom_install_status_transitions_to_completed(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            settings = _build_settings(root)
            asset_path = root / "custom-asset.bin"
            asset_path.write_bytes(b"asset")
            asset_sha = hashlib.sha256(asset_path.read_bytes()).hexdigest()
            manifest_path = root / "custom-provider.json"
            manifest_path.write_text(
                json.dumps(
                    {
                        "schemaVersion": 1,
                        "providerId": "custom-local-status-check",
                        "displayName": "Custom Local Status Check",
                        "providerVersion": "0.1.0",
                        "category": "piano-transcription",
                        "assets": [
                            {
                                "name": "weights",
                                "url": asset_path.resolve().as_uri(),
                                "sha256": asset_sha,
                            }
                        ],
                    }
                ),
                encoding="utf-8",
            )
            registry_service = CustomProviderRegistryService(settings)
            installation_service = ProviderInstallationService(settings)

            with patch("app.services.provider_installation.custom_provider_registry_service", registry_service):
                response = installation_service.start_custom_install(
                    CustomProviderInstallRequest(
                        sourceType="manifest_url",
                        manifestUrl=manifest_path.resolve().as_uri(),
                    )
                )

                self.assertEqual(response.status, "started")
                self.assertTrue(response.install_id)

                completed = None
                for _ in range(40):
                    completed = installation_service.get_install(response.install_id or "")
                    if completed is not None and completed.state in {"completed", "failed"}:
                        break
                    time.sleep(0.05)

            self.assertIsNotNone(completed)
            self.assertEqual(completed.state, "completed")
            self.assertEqual(completed.provider_layer, "custom")

    def test_registry_rejects_non_file_manifest_urls(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            settings = _build_settings(Path(temp_dir))
            registry_service = CustomProviderRegistryService(settings)

            manifest, failure = registry_service.validate_manifest_url("https://example.com/provider.json")

            self.assertIsNone(manifest)
            self.assertIsNotNone(failure)
            self.assertEqual(failure.reason, "unsupported_source")


if __name__ == "__main__":
    unittest.main()
