from __future__ import annotations

import io
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import get_settings
from app.main import app


class CorsConfigTests(unittest.TestCase):
    def tearDown(self) -> None:
        get_settings.cache_clear()

    def test_upload_route_allows_localhost_fallback_frontend_port(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            get_settings.cache_clear()
            client = TestClient(app)

            preflight_response = client.options(
                "/api/v1/uploads",
                headers={
                    "Origin": "http://localhost:3001",
                    "Access-Control-Request-Method": "POST",
                    "Access-Control-Request-Headers": "content-type",
                },
            )
            upload_response = client.post(
                "/api/v1/uploads",
                headers={"Origin": "http://localhost:3001"},
                files={"file": ("demo.wav", io.BytesIO(b"fake-audio"), "audio/wav")},
            )

        self.assertEqual(preflight_response.status_code, 200)
        self.assertEqual(preflight_response.headers.get("access-control-allow-origin"), "http://localhost:3001")
        self.assertEqual(upload_response.status_code, 200)
        self.assertEqual(upload_response.headers.get("access-control-allow-origin"), "http://localhost:3001")

    def test_settings_default_cors_origins_include_local_fallback_ports(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            get_settings.cache_clear()
            settings = get_settings()

        self.assertIn("http://localhost:3000", settings.cors_origins)
        self.assertIn("http://localhost:3001", settings.cors_origins)
        self.assertIn("http://127.0.0.1:3000", settings.cors_origins)
        self.assertIn("http://127.0.0.1:3001", settings.cors_origins)
        self.assertEqual(settings.cors_origin_regex, r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$")


if __name__ == "__main__":
    unittest.main()
