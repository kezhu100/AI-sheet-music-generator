from __future__ import annotations

import sys
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app
from app.models.schemas import JobResult, NoteEvent
from app.services.correction_analysis import CorrectionAnalysisService
from app.services.job_store import job_store


def build_result(project_name: str = "correction-demo") -> JobResult:
    return JobResult.model_validate(
        {
            "projectName": project_name,
            "bpm": 120,
            "stems": [],
            "warnings": [],
            "tracks": [
                {
                    "instrument": "piano",
                    "sourceStem": "piano_stem",
                    "provider": "heuristic",
                    "eventCount": 4,
                    "notes": [
                        {
                            "id": "piano-1",
                            "draftNoteId": "draft:piano:1",
                            "instrument": "piano",
                            "pitch": 60,
                            "onsetSec": 0.5,
                            "offsetSec": 1.0,
                            "velocity": 88,
                            "sourceStem": "piano_stem",
                        },
                        {
                            "id": "piano-2",
                            "draftNoteId": "draft:piano:2",
                            "instrument": "piano",
                            "pitch": 62,
                            "onsetSec": 1.0,
                            "offsetSec": 1.5,
                            "velocity": 90,
                            "sourceStem": "piano_stem",
                        },
                        {
                            "id": "piano-3",
                            "draftNoteId": "draft:piano:3",
                            "instrument": "piano",
                            "pitch": 64,
                            "onsetSec": 1.5,
                            "offsetSec": 2.0,
                            "velocity": 87,
                            "sourceStem": "piano_stem",
                        },
                        {
                            "id": "piano-4",
                            "draftNoteId": "draft:piano:4",
                            "instrument": "piano",
                            "pitch": 65,
                            "onsetSec": 2.0,
                            "offsetSec": 2.5,
                            "velocity": 89,
                            "sourceStem": "piano_stem",
                        },
                    ],
                },
                {
                    "instrument": "drums",
                    "sourceStem": "drum_stem",
                    "provider": "heuristic",
                    "eventCount": 2,
                    "notes": [
                        {
                            "id": "drum-1",
                            "draftNoteId": "draft:drum:1",
                            "instrument": "drums",
                            "drumLabel": "kick",
                            "midiNote": 36,
                            "onsetSec": 0.5,
                            "offsetSec": 0.625,
                            "velocity": 95,
                            "sourceStem": "drum_stem",
                        },
                        {
                            "id": "drum-2",
                            "draftNoteId": "draft:drum:2",
                            "instrument": "drums",
                            "drumLabel": "snare",
                            "midiNote": 38,
                            "onsetSec": 1.0,
                            "offsetSec": 1.125,
                            "velocity": 96,
                            "sourceStem": "drum_stem",
                        },
                    ],
                },
            ],
        }
    )


class CorrectionAnalysisServiceTests(unittest.TestCase):
    def test_pitch_anomaly_detection_flags_large_outlier(self) -> None:
        result = build_result("pitch-outlier")
        result.tracks[0].notes[2].pitch = 84

        suggestions = CorrectionAnalysisService().analyze_draft(result)

        pitch_suggestions = [suggestion for suggestion in suggestions if suggestion.type == "pitch"]
        self.assertTrue(any(suggestion.note_id == "draft:piano:3" for suggestion in pitch_suggestions))
        target = next(suggestion for suggestion in pitch_suggestions if suggestion.note_id == "draft:piano:3")
        self.assertEqual(target.suggested_change.pitch, 62)

    def test_timing_anomaly_detection_flags_off_grid_note(self) -> None:
        result = build_result("timing-outlier")
        result.tracks[0].notes[1].onset_sec = 1.18
        result.tracks[0].notes[1].offset_sec = 1.68

        suggestions = CorrectionAnalysisService().analyze_draft(result)

        timing_suggestions = [suggestion for suggestion in suggestions if suggestion.type == "timing"]
        self.assertTrue(any(suggestion.note_id == "draft:piano:2" for suggestion in timing_suggestions))
        target = next(suggestion for suggestion in timing_suggestions if suggestion.note_id == "draft:piano:2")
        self.assertEqual(target.suggested_change.onset_sec, 1.125)
        self.assertEqual(target.suggested_change.offset_sec, 1.625)

    def test_empty_suggestions_for_clean_draft(self) -> None:
        result = build_result("clean-draft")

        suggestions = CorrectionAnalysisService().analyze_draft(result)

        self.assertEqual(suggestions, [])

    def test_overlap_anomaly_detection_trims_earlier_same_pitch_note(self) -> None:
        result = build_result("overlap-outlier")
        result.tracks[0].notes[0].pitch = 60
        result.tracks[0].notes[1].pitch = 60
        result.tracks[0].notes[0].offset_sec = 1.3
        result.tracks[0].notes[1].onset_sec = 1.0

        suggestions = CorrectionAnalysisService().analyze_draft(result)

        timing_suggestions = [suggestion for suggestion in suggestions if suggestion.type == "timing"]
        self.assertTrue(any(suggestion.note_id == "draft:piano:1" for suggestion in timing_suggestions))

    def test_multiple_suggestions_across_anomaly_types(self) -> None:
        result = build_result("multiple-anomalies")
        result.tracks[0].notes[2].pitch = 84
        result.tracks[0].notes[1].onset_sec = 1.18
        result.tracks[0].notes[1].offset_sec = 1.68
        result.tracks[1].notes = [
            NoteEvent.model_validate(
                {
                    "id": "drum-1",
                    "draftNoteId": "draft:drum:1",
                    "instrument": "drums",
                    "drumLabel": "kick",
                    "midiNote": 36,
                    "onsetSec": 0.5,
                    "offsetSec": 0.625,
                    "velocity": 95,
                    "sourceStem": "drum_stem",
                }
            ),
            NoteEvent.model_validate(
                {
                    "id": "drum-2",
                    "draftNoteId": "draft:drum:2",
                    "instrument": "drums",
                    "drumLabel": "snare",
                    "midiNote": 38,
                    "onsetSec": 0.5,
                    "offsetSec": 0.625,
                    "velocity": 96,
                    "sourceStem": "drum_stem",
                }
            ),
            NoteEvent.model_validate(
                {
                    "id": "drum-3",
                    "draftNoteId": "draft:drum:3",
                    "instrument": "drums",
                    "drumLabel": "hi-hat",
                    "midiNote": 42,
                    "onsetSec": 0.5,
                    "offsetSec": 0.625,
                    "velocity": 94,
                    "sourceStem": "drum_stem",
                }
            ),
        ]
        result.tracks[1].event_count = len(result.tracks[1].notes)

        suggestions = CorrectionAnalysisService().analyze_draft(result)
        suggestion_types = {suggestion.type for suggestion in suggestions}

        self.assertIn("pitch", suggestion_types)
        self.assertIn("timing", suggestion_types)
        self.assertIn("drum-pattern", suggestion_types)


class AnalyzeDraftApiTests(unittest.TestCase):
    def test_analyze_draft_endpoint_returns_suggestions(self) -> None:
        result = build_result("api-analysis")
        result.tracks[0].notes[2].pitch = 84
        job = job_store.create("upload-analysis")
        job_store.complete(job.id, result)

        response = TestClient(app).post(
            f"/api/v1/jobs/{job.id}/analyze-draft",
            json={"draftResult": result.model_dump(mode="json", by_alias=True)},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "ok")
        self.assertGreaterEqual(len(response.json()["suggestions"]), 1)

    def test_analyze_draft_endpoint_returns_404_for_missing_job(self) -> None:
        response = TestClient(app).post(
            "/api/v1/jobs/missing/analyze-draft",
            json={"draftResult": build_result("missing").model_dump(mode="json", by_alias=True)},
        )

        self.assertEqual(response.status_code, 404)

    def test_analyze_draft_endpoint_returns_409_for_incomplete_job(self) -> None:
        job = job_store.create("upload-analysis-incomplete")
        response = TestClient(app).post(
            f"/api/v1/jobs/{job.id}/analyze-draft",
            json={"draftResult": build_result("incomplete").model_dump(mode="json", by_alias=True)},
        )

        self.assertEqual(response.status_code, 409)

    def test_analyze_draft_endpoint_returns_422_for_invalid_payload(self) -> None:
        job = job_store.create("upload-analysis-invalid")
        job_store.complete(job.id, build_result("invalid-baseline"))
        invalid_payload = build_result("invalid").model_dump(mode="json", by_alias=True)
        invalid_payload["tracks"][0]["notes"][0]["pitch"] = 300

        response = TestClient(app).post(
            f"/api/v1/jobs/{job.id}/analyze-draft",
            json={"draftResult": invalid_payload},
        )

        self.assertEqual(response.status_code, 422)


if __name__ == "__main__":
    unittest.main()
