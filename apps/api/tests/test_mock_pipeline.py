from __future__ import annotations

from pathlib import Path
from tempfile import TemporaryDirectory
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.pipeline.mock_pipeline import build_mock_pipeline


class MockPipelineTests(unittest.TestCase):
    def test_pipeline_returns_persisted_stems_and_mock_tracks(self) -> None:
        with TemporaryDirectory() as temp_dir:
            audio_path = Path(temp_dir) / "demo.wav"
            audio_path.write_bytes(b"fake-audio")

            result = build_mock_pipeline().run(audio_path, "demo.wav", "job-test")

        self.assertEqual(result.project_name, "demo")
        self.assertEqual(len(result.stems), 2)
        self.assertEqual(len(result.tracks), 2)
        self.assertEqual({stem.instrument_hint for stem in result.stems}, {"piano", "drums"})
        self.assertEqual({track.instrument for track in result.tracks}, {"piano", "drums"})
        self.assertTrue(all(stem.stored_path.startswith("data/stems/job-test/") for stem in result.stems))


if __name__ == "__main__":
    unittest.main()
