from __future__ import annotations

from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.models.schemas import NoteEvent, ProcessingPreferences, TrackResult
from app.pipeline.post_processing import LightweightPostProcessor
from app.pipeline.post_processing_helpers import build_piano_post_processing_settings_from_preset


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

    def test_post_processing_off_bypasses_piano_cleanup_filters(self) -> None:
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
                self._piano_note("isolated-high-noise", 2.20, 2.32, 106, 0.46),
            ],
        )

        result = processor.process(
            [track],
            warnings=[],
            processing_preferences=ProcessingPreferences.model_validate(
                {"pianoPostProcessing": {"enabled": False}}
            ),
        )
        note_ids = [note.id for note in result.tracks[0].notes]

        self.assertEqual(
            note_ids,
            ["duplicate-low", "duplicate-strong", "short-weak", "isolated-high-noise"],
        )
        self.assertFalse(any("filtered 1 low-confidence" in warning for warning in result.warnings))
        self.assertFalse(any("removed 1 near-duplicate" in warning for warning in result.warnings))
        self.assertTrue(any("turned off" in warning for warning in result.warnings))

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

    def test_filters_isolated_weak_extreme_register_piano_note_as_residual(self) -> None:
        processor = LightweightPostProcessor()
        track = TrackResult(
            instrument="piano",
            sourceStem="piano_stem",
            provider="provider-a",
            eventCount=4,
            notes=[
                self._piano_note("keep-left", 0.00, 0.42, 60, 0.86),
                self._piano_note("keep-right", 0.50, 0.92, 64, 0.84),
                self._piano_note("keep-third", 1.02, 1.38, 67, 0.82),
                self._piano_note("isolated-high-noise", 2.20, 2.32, 106, 0.46),
            ],
        )

        result = processor.process([track], warnings=[])
        note_ids = [note.id for note in result.tracks[0].notes]

        self.assertEqual(note_ids, ["keep-left", "keep-right", "keep-third"])
        self.assertIn(
            "Phase 11D post-processing removed 1 suspicious piano note events that looked more like source-separation residuals than stable piano notes.",
            result.warnings,
        )

    def test_filters_suspicious_long_weak_piano_note(self) -> None:
        processor = LightweightPostProcessor()
        track = TrackResult(
            instrument="piano",
            sourceStem="piano_stem",
            provider="provider-a",
            eventCount=4,
            notes=[
                self._piano_note("keep-a", 0.00, 0.40, 60, 0.88),
                self._piano_note("keep-b", 0.52, 0.94, 64, 0.87),
                self._piano_note("keep-c", 1.04, 1.42, 67, 0.85),
                self._piano_note("long-pad-like", 1.60, 7.80, 58, 0.61),
            ],
        )

        result = processor.process([track], warnings=[])
        note_ids = [note.id for note in result.tracks[0].notes]

        self.assertEqual(note_ids, ["keep-a", "keep-b", "keep-c"])
        self.assertIn(
            "Phase 11D post-processing removed 1 suspicious piano note events that looked more like source-separation residuals than stable piano notes.",
            result.warnings,
        )

    def test_keeps_sparse_but_confident_supported_piano_notes(self) -> None:
        processor = LightweightPostProcessor()
        track = TrackResult(
            instrument="piano",
            sourceStem="piano_stem",
            provider="provider-a",
            eventCount=3,
            notes=[
                self._piano_note("left", 0.00, 0.52, 55, 0.83),
                self._piano_note("middle", 0.38, 0.90, 60, 0.86),
                self._piano_note("right", 0.82, 1.30, 64, 0.84),
            ],
        )

        result = processor.process([track], warnings=[])
        note_ids = [note.id for note in result.tracks[0].notes]

        self.assertEqual(note_ids, ["left", "middle", "right"])
        self.assertFalse(any("suspicious piano note events" in warning for warning in result.warnings))

    def test_low_medium_and_high_presets_expose_distinct_backend_values(self) -> None:
        low = build_piano_post_processing_settings_from_preset("low")
        medium = build_piano_post_processing_settings_from_preset("medium")
        high = build_piano_post_processing_settings_from_preset("high")

        self.assertLess(low.confidence_threshold, medium.confidence_threshold)
        self.assertLess(medium.confidence_threshold, high.confidence_threshold)
        self.assertLess(low.duplicate_merge_tolerance_ms, medium.duplicate_merge_tolerance_ms)
        self.assertLess(medium.duplicate_merge_tolerance_ms, high.duplicate_merge_tolerance_ms)
        self.assertLess(low.overlap_trim_aggressiveness, medium.overlap_trim_aggressiveness)
        self.assertLess(medium.overlap_trim_aggressiveness, high.overlap_trim_aggressiveness)
        self.assertFalse(low.extreme_note_filtering)
        self.assertTrue(medium.extreme_note_filtering)
        self.assertTrue(high.extreme_note_filtering)

    def test_custom_advanced_settings_can_keep_extreme_note_when_filtering_is_disabled(self) -> None:
        processor = LightweightPostProcessor()
        track = TrackResult(
            instrument="piano",
            sourceStem="piano_stem",
            provider="provider-a",
            eventCount=4,
            notes=[
                self._piano_note("keep-left", 0.00, 0.42, 60, 0.86),
                self._piano_note("keep-right", 0.50, 0.92, 64, 0.84),
                self._piano_note("keep-third", 1.02, 1.38, 67, 0.82),
                self._piano_note("isolated-high-noise", 2.20, 2.32, 106, 0.46),
            ],
        )

        result = processor.process(
            [track],
            warnings=[],
            processing_preferences=ProcessingPreferences.model_validate(
                {
                    "pianoPostProcessing": {
                        "preset": "custom",
                        "basePreset": "medium",
                        "isolatedWeakNoteThreshold": 0.40,
                        "duplicateMergeToleranceMs": 80,
                        "overlapTrimAggressiveness": 0.75,
                        "extremeNoteFiltering": False,
                        "confidenceThreshold": 0.35,
                    }
                }
            ),
        )

        self.assertEqual(
            [note.id for note in result.tracks[0].notes],
            ["keep-left", "keep-right", "keep-third", "isolated-high-noise"],
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
