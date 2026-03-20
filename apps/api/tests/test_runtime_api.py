from __future__ import annotations

import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import get_settings
from app.main import app


class RuntimeApiTests(unittest.TestCase):
    def tearDown(self) -> None:
        get_settings.cache_clear()

    def test_runtime_endpoint_reports_ready_for_default_local_configuration(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            get_settings.cache_clear()

            response = TestClient(app).get("/api/v1/runtime")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["severity"], "ready")
        self.assertTrue(payload["ready"])
        provider_statuses = {provider["key"]: provider for provider in payload["providers"]}
        self.assertEqual(provider_statuses["source-separation"]["status"], "ready")
        self.assertEqual(provider_statuses["piano-transcription"]["status"], "ready")
        self.assertEqual(provider_statuses["drum-transcription"]["status"], "ready")
        self.assertEqual(
            [option["provider"] for option in provider_statuses["source-separation"]["options"]],
            ["development-copy", "demucs"],
        )
        self.assertEqual(
            [option["provider"] for option in provider_statuses["piano-transcription"]["options"]],
            ["heuristic", "basic-pitch"],
        )
        self.assertEqual(
            [option["provider"] for option in provider_statuses["drum-transcription"]["options"]],
            ["heuristic", "demucs-drums"],
        )
        source_option = provider_statuses["source-separation"]["options"][0]
        self.assertEqual(source_option["id"], "development-copy")
        self.assertEqual(source_option["category"], "source-separation")
        self.assertEqual(source_option["providerLayer"], "built_in_base")
        self.assertTrue(source_option["builtIn"])
        self.assertFalse(source_option["optionalEnhanced"])
        self.assertTrue(source_option["installed"])
        self.assertIn("statusText", source_option)
        self.assertIn("helpText", source_option)
        demucs_option = provider_statuses["source-separation"]["options"][1]
        self.assertEqual(demucs_option["providerLayer"], "official_enhanced")
        demucs_drums_option = provider_statuses["drum-transcription"]["options"][1]
        self.assertIn("Demucs drum stem isolation", demucs_drums_option["helpText"])
        self.assertIn("heuristic drum provider", demucs_drums_option["helpText"])
        self.assertEqual(provider_statuses["source-separation"]["customProviders"], [])

    def test_runtime_endpoint_includes_cors_headers_for_local_fallback_frontend_port(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            get_settings.cache_clear()
            client = TestClient(app)

            preflight_response = client.options(
                "/api/v1/runtime",
                headers={
                    "Origin": "http://127.0.0.1:3001",
                    "Access-Control-Request-Method": "GET",
                },
            )
            response = client.get("/api/v1/runtime", headers={"Origin": "http://127.0.0.1:3001"})

        self.assertEqual(preflight_response.status_code, 200)
        self.assertEqual(preflight_response.headers.get("access-control-allow-origin"), "http://127.0.0.1:3001")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers.get("access-control-allow-origin"), "http://127.0.0.1:3001")

    def test_runtime_endpoint_reports_degraded_when_selected_ml_provider_has_fallback(self) -> None:
        with patch.dict(
            os.environ,
            {
                "PIANO_TRANSCRIPTION_PROVIDER": "ml",
                "PIANO_TRANSCRIPTION_FALLBACK_PROVIDER": "heuristic",
                "PIANO_TRANSCRIPTION_ML_PYTHON": "Z:/missing/python.exe",
            },
            clear=True,
        ):
            get_settings.cache_clear()

            response = TestClient(app).get("/api/v1/runtime")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["severity"], "degraded")
        self.assertTrue(payload["ready"])
        piano_status = next(provider for provider in payload["providers"] if provider["key"] == "piano-transcription")
        self.assertEqual(piano_status["status"], "degraded-fallback")
        basic_pitch_option = next(option for option in piano_status["options"] if option["provider"] == "basic-pitch")
        self.assertFalse(basic_pitch_option["available"])

    def test_runtime_endpoint_reports_blocking_when_selected_ml_provider_has_no_fallback(self) -> None:
        with patch.dict(
            os.environ,
            {
                "DRUM_TRANSCRIPTION_PROVIDER": "demucs-drums",
                "DRUM_TRANSCRIPTION_ML_PYTHON": "Z:/missing/python.exe",
            },
            clear=True,
        ):
            get_settings.cache_clear()

            response = TestClient(app).get("/api/v1/runtime")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["severity"], "blocking")
        self.assertFalse(payload["ready"])
        drum_status = next(provider for provider in payload["providers"] if provider["key"] == "drum-transcription")
        self.assertEqual(drum_status["status"], "blocking-misconfigured")

    def test_runtime_install_endpoint_reports_unknown_provider_failure(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            get_settings.cache_clear()

            response = TestClient(app).post("/api/v1/runtime/providers/unknown-provider/install", json={})

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["status"], "failed")
        self.assertEqual(payload["failureReason"], "unknown_provider")
        self.assertEqual(payload["providerId"], "unknown-provider")

    def test_runtime_install_status_endpoint_returns_not_found_for_missing_task(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            get_settings.cache_clear()

            response = TestClient(app).get("/api/v1/runtime/providers/install/not-a-real-id")

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["detail"], "Install task not found.")

    def test_custom_runtime_install_endpoint_rejects_unsupported_manifest_source(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            get_settings.cache_clear()

            response = TestClient(app).post(
                "/api/v1/runtime/providers/custom/install",
                json={"sourceType": "manifest_url", "manifestUrl": "https://example.com/provider.json"},
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["status"], "failed")
        self.assertEqual(payload["failureReason"], "unsupported_source")


if __name__ == "__main__":
    unittest.main()
