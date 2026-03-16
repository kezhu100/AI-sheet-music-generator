from __future__ import annotations

from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.models.schemas import NoteEvent, TrackResult
from app.pipeline.post_processing import LightweightPostProcessor


class PostProcessingTests(unittest.TestCase):
    def test_estimates_tempo_from_noisy_onsets_and_keeps_single_project_bpm(self) -> None:
        processor = LightweightPostProcessor()
        track = TrackResult(
            instrument="piano",
            sourceStem="piano_stem",
            provider="provider-a",
            eventCount=6,
            notes=[
                self._piano_note("n1", 0.00, 0.40, 60, 0.91),
                self._piano_note("n2", 0.49, 0.86, 62, 0.88),
                self._piano_note("n3", 1.02, 1.36, 64, 0.9),
                self._piano_note("n4", 1.49, 1.83, 65, 0.86),
                self._piano_note("n5", 2.01, 2.35, 67, 0.87),
                self._piano_note("n6", 2.52, 2.88, 69, 0.89),
            ],
        )

        result = processor.process([track], warnings=[])

        self.assertGreaterEqual(result.bpm, 116)
        self.assertLessEqual(result.bpm, 124)
        self.assertEqual(len(result.tracks), 1)
        self.assertFalse(any("fell back to 120 BPM" in warning for warning in result.warnings))

    def test_filters_short_low_confidence_piano_notes_and_deduplicates_near_duplicates(self) -> None:
        processor = LightweightPostProcessor()
        track = TrackResult(
            instrument="piano",
            sourceStem="piano_stem",
            provider="provider-a",
            eventCount=4,
            notes=[
                self._piano_note("duplicate-low", 0.50, 0.88, 60, 0.44),
                self._piano_note("duplicate-strong", 0.53, 0.96, 60, 0.92),
                self._piano_note("short-weak", 1.02, 1.09, 67, 0.41),
                self._piano_note("keep", 1.48, 1.88, 64, 0.86),
            ],
        )

        result = processor.process([track], warnings=[])
        note_ids = [note.id for note in result.tracks[0].notes]

        self.assertEqual(note_ids, ["duplicate-strong", "keep"])
        self.assertIn(
            "Phase 11D post-processing filtered 1 low-confidence note events before returning the normalized result.",
            result.warnings,
        )
        self.assertIn(
            "Phase 11D post-processing removed 1 near-duplicate note events while cleaning overlapping provider output.",
            result.warnings,
        )

    def test_trims_overlapping_piano_notes_after_quantization(self) -> None:
        processor = LightweightPostProcessor()
        track = TrackResult(
            instrument="piano",
            sourceStem="piano_stem",
            provider="provider-a",
            eventCount=2,
            notes=[
                self._piano_note("left", 0.02, 0.82, 60, 0.9),
                self._piano_note("right", 0.51, 0.96, 60, 0.88),
            ],
        )

        result = processor.process([track], warnings=[])
        notes = result.tracks[0].notes

        self.assertEqual(len(notes), 2)
        self.assertLessEqual(notes[0].offset_sec, notes[1].onset_sec)
        self.assertIn(
            "Phase 11D post-processing trimmed 1 overlapping piano note durations to keep the final result more playable.",
            result.warnings,
        )

    def test_merges_same_instrument_and_source_stem_tracks_with_stable_provider_name(self) -> None:
        processor = LightweightPostProcessor()
        merged = processor.process(
            [
                TrackResult(
                    instrument="drums",
                    sourceStem="drum_stem",
                    provider="provider-b",
                    eventCount=1,
                    notes=[self._drum_note("b", 0.48, 38, 0.81)],
                ),
                TrackResult(
                    instrument="drums",
                    sourceStem="drum_stem",
                    provider="provider-a",
                    eventCount=1,
                    notes=[self._drum_note("a", 0.02, 36, 0.9)],
                ),
            ],
            warnings=[],
        )

        self.assertEqual(len(merged.tracks), 1)
        self.assertEqual(merged.tracks[0].provider, "provider-a+provider-b")
        self.assertEqual([note.id for note in merged.tracks[0].notes], ["a", "b"])

    def test_falls_back_to_default_bpm_for_sparse_event_sets(self) -> None:
        processor = LightweightPostProcessor()
        track = TrackResult(
            instrument="drums",
            sourceStem="drum_stem",
            provider="provider-a",
            eventCount=1,
            notes=[self._drum_note("only", 0.48, 36, 0.84)],
        )

        result = processor.process([track], warnings=[])

        self.assertEqual(result.bpm, 120)
        self.assertIn(
            "Phase 11D post-processing could not estimate tempo from the current events, so the result fell back to 120 BPM.",
            result.warnings,
        )
        self.assertEqual(result.tracks[0].notes[0].bar, 1)
        self.assertEqual(result.tracks[0].notes[0].beat, 2.0)

    def _piano_note(self, note_id: str, onset: float, offset: float, pitch: int, confidence: float) -> NoteEvent:
        return NoteEvent(
            id=note_id,
            instrument="piano",
            pitch=pitch,
            onsetSec=onset,
            offsetSec=offset,
            confidence=confidence,
            velocity=96,
            sourceStem="piano_stem",
        )

    def _drum_note(self, note_id: str, onset: float, midi_note: int, confidence: float) -> NoteEvent:
        return NoteEvent(
            id=note_id,
            instrument="drums",
            drumLabel="kick" if midi_note == 36 else "snare",
            midiNote=midi_note,
            onsetSec=onset,
            offsetSec=onset + 0.08,
            confidence=confidence,
            velocity=100,
            sourceStem="drum_stem",
        )


if __name__ == "__main__":
    unittest.main()
