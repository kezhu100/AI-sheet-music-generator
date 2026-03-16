from __future__ import annotations

from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import Settings
from app.pipeline.source_separation import (
    DemucsSourceSeparationProvider,
    FallbackSourceSeparationProvider,
    LocalDevelopmentSourceSeparationProvider,
    SOURCE_SEPARATION_PROVIDER_DEVELOPMENT,
    SOURCE_SEPARATION_PROVIDER_DEMUCS,
    build_source_separation_provider,
)


class SourceSeparationProviderSelectionTests(unittest.TestCase):
    def test_build_source_separation_provider_uses_explicit_development_provider(self) -> None:
        provider = build_source_separation_provider(
            Settings(
                source_separation_provider=SOURCE_SEPARATION_PROVIDER_DEVELOPMENT,
            )
        )

        self.assertIsInstance(provider, LocalDevelopmentSourceSeparationProvider)

    def test_build_source_separation_provider_wraps_demucs_with_configured_fallback(self) -> None:
        provider = build_source_separation_provider(
            Settings(
                source_separation_provider=SOURCE_SEPARATION_PROVIDER_DEMUCS,
                source_separation_fallback_provider=SOURCE_SEPARATION_PROVIDER_DEVELOPMENT,
            )
        )

        self.assertIsInstance(provider, FallbackSourceSeparationProvider)

    def test_demucs_falls_back_to_development_copy_when_runtime_is_unavailable(self) -> None:
        provider = FallbackSourceSeparationProvider(
            primary=DemucsSourceSeparationProvider(python_executable="Z:/missing/python.exe"),
            fallback=LocalDevelopmentSourceSeparationProvider(),
        )

        with TemporaryDirectory() as temp_dir:
            audio_path = Path(temp_dir) / "demo.wav"
            audio_path.write_bytes(b"placeholder-audio")

            result = provider.separate(audio_path, "job-fallback")

        self.assertEqual(result.provider_name, "local-development-separation")
        self.assertEqual(len(result.stems), 2)
        self.assertTrue(all(stem.stem_asset.provider == "local-development-separation" for stem in result.stems))
        self.assertIn("Configured source separation provider 'demucs-separation' was unavailable", result.warnings[0])
        self.assertIn(
            "Source separation ran with the development copy provider, so the uploaded file was duplicated into placeholder stems instead of being truly separated.",
            result.warnings,
        )


if __name__ == "__main__":
    unittest.main()
