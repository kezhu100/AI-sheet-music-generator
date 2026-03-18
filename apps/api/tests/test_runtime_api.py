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

    def test_runtime_endpoint_reports_blocking_when_selected_ml_provider_has_no_fallback(self) -> None:
        with patch.dict(
            os.environ,
            {
                "DRUM_TRANSCRIPTION_PROVIDER": "madmom",
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


if __name__ == "__main__":
    unittest.main()
