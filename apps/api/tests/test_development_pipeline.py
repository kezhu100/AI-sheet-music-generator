from __future__ import annotations

import math
from pathlib import Path
from tempfile import TemporaryDirectory
import sys
import unittest
import wave

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.models.schemas import NoteEvent, TrackResult
from app.core.config import Settings
from app.pipeline.development_pipeline import build_development_pipeline
from app.pipeline.post_processing import LightweightPostProcessor


class DevelopmentPipelineTests(unittest.TestCase):
    def test_pipeline_returns_persisted_stems_and_real_piano_and_drum_tracks_for_pcm_wav(self) -> None:
        with TemporaryDirectory() as temp_dir:
            audio_path = Path(temp_dir) / "demo.wav"
            self._write_test_clip(
                audio_path,
            )

            result = build_development_pipeline(
                Settings(
                    source_separation_provider="development-copy",
                    piano_transcription_provider="heuristic",
                )
            ).run(audio_path, "demo.wav", "job-test")

        self.assertEqual(result.project_name, "demo")
        self.assertEqual(result.bpm, 120)
        self.assertEqual(len(result.stems), 2)
        self.assertEqual(len(result.tracks), 2)
        self.assertEqual({stem.instrument_hint for stem in result.stems}, {"piano", "drums"})
        self.assertEqual({track.instrument for track in result.tracks}, {"piano", "drums"})
        self.assertTrue(all(stem.stored_path.startswith("data/stems/job-test/") for stem in result.stems))
        self.assertIn(
            "Source separation ran with the development copy provider, so the uploaded file was duplicated into placeholder stems instead of being truly separated.",
            result.warnings,
        )
        self.assertIn(
            "Drum transcription is now a real heuristic MVP provider that consumes the persisted drum stem and currently supports only uncompressed PCM .wav stems.",
            result.warnings,
        )

        piano_track = next(track for track in result.tracks if track.instrument == "piano")
        self.assertEqual(piano_track.provider, "heuristic-wav-piano-provider")
        self.assertGreaterEqual(len(piano_track.notes), 3)
        self.assertTrue(all(note.bar is not None for note in piano_track.notes))
        self.assertTrue(all(note.beat is not None for note in piano_track.notes))

        detected_pitches = [note.pitch for note in piano_track.notes if note.pitch is not None]
        self.assertIn(60, detected_pitches)
        self.assertIn(64, detected_pitches)
        self.assertIn(67, detected_pitches)
        self.assertTrue(all(self._is_sixteenth_aligned(note.onset_sec, result.bpm) for note in piano_track.notes))

        drum_track = next(track for track in result.tracks if track.instrument == "drums")
        self.assertEqual(drum_track.provider, "heuristic-wav-drum-provider")
        self.assertGreaterEqual(len(drum_track.notes), 3)
        self.assertTrue(all(note.bar is not None for note in drum_track.notes))
        self.assertTrue(all(note.beat is not None for note in drum_track.notes))

        later_drum_notes = [note for note in drum_track.notes if note.onset_sec >= 1.5]
        detected_labels = {note.drum_label for note in later_drum_notes if note.drum_label is not None}
        self.assertIn("kick", detected_labels)
        self.assertIn("snare", detected_labels)
        self.assertIn("hi-hat", detected_labels)

    def test_pipeline_filters_low_confidence_events_during_post_processing(self) -> None:
        processor = LightweightPostProcessor()
        input_track = TrackResult(
            instrument="drums",
            sourceStem="drum_stem",
            provider="test-provider",
            eventCount=2,
            notes=[
                NoteEvent(
                    id="low-confidence",
                    instrument="drums",
                    drumLabel="snare",
                    midiNote=38,
                    onsetSec=0.24,
                    offsetSec=0.31,
                    confidence=0.2,
                    sourceStem="drum_stem",
                ),
                NoteEvent(
                    id="strong-hit",
                    instrument="drums",
                    drumLabel="kick",
                    midiNote=36,
                    onsetSec=0.51,
                    offsetSec=0.58,
                    confidence=0.81,
                    sourceStem="drum_stem",
                ),
            ],
        )

        result = processor.process([input_track], warnings=[])

        self.assertEqual(result.bpm, 120)
        self.assertIn(
            "Phase 5 post-processing filtered 1 low-confidence note events before returning the normalized result.",
            result.warnings,
        )
        self.assertEqual(len(result.tracks), 1)
        self.assertEqual(result.tracks[0].event_count, 1)
        self.assertEqual(result.tracks[0].notes[0].id, "strong-hit")
        self.assertEqual(result.tracks[0].notes[0].bar, 1)
        self.assertEqual(result.tracks[0].notes[0].beat, 2.0)

    def _write_test_clip(self, target_path: Path) -> None:
        sample_rate = 44100
        amplitude = 12000
        frames: list[int] = []

        piano_notes = [
            (261.63, 0.35, 0.12),
            (329.63, 0.35, 0.12),
            (392.00, 0.35, 0.12),
        ]

        for frequency, duration_sec, gap_sec in piano_notes:
            note_samples = int(sample_rate * duration_sec)
            gap_samples = int(sample_rate * gap_sec)

            for sample_index in range(note_samples):
                attack = min(1.0, sample_index / max(1, int(sample_rate * 0.02)))
                decay = max(0.2, 1.0 - (sample_index / max(1, note_samples)))
                value = math.sin((2 * math.pi * frequency * sample_index) / sample_rate)
                frames.append(int(amplitude * attack * decay * value))

            frames.extend(0 for _ in range(gap_samples))

        drum_events = [
            ("kick", 1.6),
            ("snare", 2.1),
            ("hihat", 2.6),
        ]

        total_samples = len(frames)
        required_samples = int(sample_rate * 3.0)
        if total_samples < required_samples:
            frames.extend(0 for _ in range(required_samples - total_samples))

        for label, onset_sec in drum_events:
            start_index = int(sample_rate * onset_sec)
            hit_samples = self._build_drum_hit(label, sample_rate, amplitude)
            for offset, sample in enumerate(hit_samples):
                target_index = start_index + offset
                if target_index >= len(frames):
                    break
                mixed = frames[target_index] + sample
                frames[target_index] = max(-32768, min(32767, mixed))

        with wave.open(str(target_path), "wb") as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(sample_rate)
            wav_file.writeframes(b"".join(int(sample).to_bytes(2, byteorder="little", signed=True) for sample in frames))

    def _build_drum_hit(self, label: str, sample_rate: int, amplitude: int) -> list[int]:
        duration_lookup = {
            "kick": 0.12,
            "snare": 0.1,
            "hihat": 0.05,
        }
        duration_sec = duration_lookup[label]
        hit_samples = int(sample_rate * duration_sec)
        output: list[int] = []

        for sample_index in range(hit_samples):
            progress = sample_index / max(1, hit_samples)
            decay = math.exp(-5.0 * progress)

            if label == "kick":
                frequency = 70 - (20 * progress)
                value = math.sin((2 * math.pi * frequency * sample_index) / sample_rate)
            elif label == "snare":
                value = (
                    math.sin((2 * math.pi * 190 * sample_index) / sample_rate) * 0.45
                    + math.sin((2 * math.pi * 3300 * sample_index) / sample_rate) * 0.2
                )
            else:
                value = (
                    math.sin((2 * math.pi * 7000 * sample_index) / sample_rate) * 0.55
                    + math.sin((2 * math.pi * 9500 * sample_index) / sample_rate) * 0.35
                )

            output.append(int(amplitude * decay * value))

        return output

    def _is_sixteenth_aligned(self, onset_sec: float, bpm: int) -> bool:
        grid = (60.0 / bpm) / 4.0
        remainder = round(onset_sec / grid, 6)
        return abs(remainder - round(remainder)) <= 1e-6


if __name__ == "__main__":
    unittest.main()
