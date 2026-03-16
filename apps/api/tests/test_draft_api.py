from __future__ import annotations

import sys
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app
from app.models.schemas import JobResult
from app.services.draft_store import draft_store
from app.services.job_store import job_store
from app.services.midi_export import build_midi_file


def build_result(project_name: str = "draft-demo", first_pitch: int = 60) -> JobResult:
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
                    "eventCount": 1,
                    "notes": [
                        {
                            "id": "note-a",
                            "draftNoteId": "draft:piano:note-a",
                            "instrument": "piano",
                            "pitch": first_pitch,
                            "onsetSec": 0.5,
                            "offsetSec": 1.0,
                            "sourceStem": "piano_stem",
                        }
                    ],
                }
            ],
        }
    )


class DraftApiTests(unittest.TestCase):
    def test_get_draft_returns_404_when_missing(self) -> None:
        job = job_store.create("upload-draft-missing")
        job_store.complete(job.id, build_result("missing-demo"))

        response = TestClient(app).get(f"/api/v1/jobs/{job.id}/draft")

        self.assertEqual(response.status_code, 404)

    def test_save_and_load_draft_returns_saved_result_and_version(self) -> None:
        job = job_store.create("upload-draft-save")
        original_result = build_result("save-demo")
        edited_result = build_result("save-demo", first_pitch=72)
        job_store.complete(job.id, original_result)

        client = TestClient(app)
        save_response = client.put(
            f"/api/v1/jobs/{job.id}/draft",
            json={"draftResult": edited_result.model_dump(mode="json", by_alias=True)},
        )

        self.assertEqual(save_response.status_code, 200)
        self.assertEqual(save_response.json()["draft"]["version"], 1)
        self.assertEqual(save_response.json()["draft"]["result"]["tracks"][0]["notes"][0]["pitch"], 72)

        load_response = client.get(f"/api/v1/jobs/{job.id}/draft")

        self.assertEqual(load_response.status_code, 200)
        self.assertEqual(load_response.json()["draft"]["version"], 1)
        self.assertEqual(load_response.json()["draft"]["result"]["tracks"][0]["notes"][0]["pitch"], 72)

    def test_saving_same_job_twice_increments_version(self) -> None:
        job = job_store.create("upload-draft-version")
        job_store.complete(job.id, build_result("version-demo"))
        client = TestClient(app)

        first_response = client.put(
            f"/api/v1/jobs/{job.id}/draft",
            json={"draftResult": build_result("version-demo", first_pitch=65).model_dump(mode="json", by_alias=True)},
        )
        second_response = client.put(
            f"/api/v1/jobs/{job.id}/draft",
            json={"draftResult": build_result("version-demo", first_pitch=67).model_dump(mode="json", by_alias=True)},
        )

        self.assertEqual(first_response.status_code, 200)
        self.assertEqual(second_response.status_code, 200)
        self.assertEqual(second_response.json()["draft"]["version"], 2)

    def test_original_export_remains_distinct_from_saved_draft(self) -> None:
        original_result = build_result("export-demo", first_pitch=60)
        edited_result = build_result("export-demo", first_pitch=72)
        job = job_store.create("upload-draft-export")
        job_store.complete(job.id, original_result)
        draft_store.save(job.id, edited_result)
        client = TestClient(app)

        original_export = client.get(f"/api/v1/jobs/{job.id}/exports/midi")
        draft_export = client.post(
            f"/api/v1/jobs/{job.id}/exports/midi",
            json={"resultOverride": edited_result.model_dump(mode="json", by_alias=True)},
        )

        self.assertEqual(original_export.status_code, 200)
        self.assertEqual(draft_export.status_code, 200)
        self.assertEqual(original_export.content, build_midi_file(original_result))
        self.assertEqual(draft_export.content, build_midi_file(edited_result))
        self.assertNotEqual(original_export.content, draft_export.content)


if __name__ == "__main__":
    unittest.main()
