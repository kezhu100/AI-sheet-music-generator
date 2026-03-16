from __future__ import annotations

from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.pipeline.timing import absolute_beat_to_bar_beat, beats_to_seconds, quantize_beat, quantize_seconds, seconds_to_beats


class TimingHelperTests(unittest.TestCase):
    def test_seconds_and_beats_round_trip(self) -> None:
        bpm = 120
        self.assertEqual(seconds_to_beats(1.0, bpm), 2.0)
        self.assertEqual(beats_to_seconds(2.0, bpm), 1.0)

    def test_quantize_beat_to_sixteenth_grid(self) -> None:
        self.assertEqual(quantize_beat(1.12), 1.0)
        self.assertEqual(quantize_beat(1.38), 1.5)

    def test_quantize_seconds_uses_bpm_grid(self) -> None:
        self.assertEqual(quantize_seconds(0.62, 120), 0.625)
        self.assertEqual(quantize_seconds(0.24, 120), 0.25)

    def test_absolute_beat_to_bar_beat(self) -> None:
        self.assertEqual(absolute_beat_to_bar_beat(0.0), (1, 1.0))
        self.assertEqual(absolute_beat_to_bar_beat(1.0), (1, 2.0))
        self.assertEqual(absolute_beat_to_bar_beat(4.0), (2, 1.0))


if __name__ == "__main__":
    unittest.main()
