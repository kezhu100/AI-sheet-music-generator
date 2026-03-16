from __future__ import annotations

import math
from pathlib import Path
from tempfile import TemporaryDirectory
import sys
import unittest
import wave

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.pipeline.mock_pipeline import build_mock_pipeline


class MockPipelineTests(unittest.TestCase):
    def test_pipeline_returns_persisted_stems_and_real_piano_track_for_pcm_wav(self) -> None:
        with TemporaryDirectory() as temp_dir:
            audio_path = Path(temp_dir) / "demo.wav"
            self._write_test_wav(
                audio_path,
                notes=[
                    (261.63, 0.35, 0.12),
                    (329.63, 0.35, 0.12),
                    (392.00, 0.35, 0.12),
                ],
            )

            result = build_mock_pipeline().run(audio_path, "demo.wav", "job-test")

        self.assertEqual(result.project_name, "demo")
        self.assertEqual(len(result.stems), 2)
        self.assertEqual(len(result.tracks), 2)
        self.assertEqual({stem.instrument_hint for stem in result.stems}, {"piano", "drums"})
        self.assertEqual({track.instrument for track in result.tracks}, {"piano", "drums"})
        self.assertTrue(all(stem.stored_path.startswith("data/stems/job-test/") for stem in result.stems))
        self.assertIn("Drum transcription remains mocked in Phase 3 and has not been replaced with a real provider yet.", result.warnings)

        piano_track = next(track for track in result.tracks if track.instrument == "piano")
        self.assertEqual(piano_track.provider, "heuristic-wav-piano-provider")
        self.assertGreaterEqual(len(piano_track.notes), 3)

        detected_pitches = [note.pitch for note in piano_track.notes if note.pitch is not None]
        self.assertIn(60, detected_pitches)
        self.assertIn(64, detected_pitches)
        self.assertIn(67, detected_pitches)

    def _write_test_wav(self, target_path: Path, notes: list[tuple[float, float, float]]) -> None:
        sample_rate = 44100
        amplitude = 12000
        frames: list[int] = []

        for frequency, duration_sec, gap_sec in notes:
            note_samples = int(sample_rate * duration_sec)
            gap_samples = int(sample_rate * gap_sec)

            for sample_index in range(note_samples):
                attack = min(1.0, sample_index / max(1, int(sample_rate * 0.02)))
                decay = max(0.2, 1.0 - (sample_index / max(1, note_samples)))
                value = math.sin((2 * math.pi * frequency * sample_index) / sample_rate)
                frames.append(int(amplitude * attack * decay * value))

            frames.extend(0 for _ in range(gap_samples))

        with wave.open(str(target_path), "wb") as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(sample_rate)
            wav_file.writeframes(b"".join(int(sample).to_bytes(2, byteorder="little", signed=True) for sample in frames))


if __name__ == "__main__":
    unittest.main()
