from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.models.schemas import JobResult, UploadedFileDescriptor, utc_now
from app.services.project_packaging import ProjectPackagingError, project_packaging_service


def build_result(project_name: str = "security-demo", stem_path: str = "assets/stems/piano_stem.wav") -> JobResult:
    return JobResult.model_validate(
        {
            "projectName": project_name,
            "bpm": 120,
            "warnings": [],
            "stems": [
                {
                    "stemName": "piano_stem",
                    "instrumentHint": "piano",
                    "provider": "development-copy",
                    "storedPath": stem_path,
                    "fileName": "piano_stem.wav",
                    "fileFormat": "wav",
                    "sizeBytes": 4096,
                }
            ],
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
                            "pitch": 60,
                            "onsetSec": 0.5,
                            "offsetSec": 1.0,
                            "sourceStem": "piano_stem",
                        }
                    ],
                }
            ],
        }
    )


class ProjectPackagingSecurityTests(unittest.TestCase):
    def test_open_local_project_rejects_manifest_upload_path_that_escapes_selected_root(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            source_dir = Path(temp_dir) / "project"
            source_dir.mkdir(parents=True, exist_ok=True)

            upload = UploadedFileDescriptor(
                uploadId="escape-upload",
                fileName="escape.wav",
                contentType="audio/wav",
                sizeBytes=1024,
                storedPath="../escape.wav",
                createdAt=utc_now(),
            )
            manifest = {
                "summary": {
                    "projectId": "security-project",
                    "jobId": "security-project",
                    "projectName": "security-demo",
                    "createdAt": utc_now().isoformat(),
                    "updatedAt": utc_now().isoformat(),
                    "status": "completed",
                    "hasSavedDraft": False,
                    "draftVersion": None,
                    "draftSavedAt": None,
                    "assets": {
                        "hasSourceUpload": True,
                        "hasStems": True,
                        "hasOriginalResult": True,
                        "availableExports": ["midi", "musicxml"],
                    },
                    "sharePath": "/projects/security-project",
                    "currentStage": "completed",
                    "statusMessage": "Completed.",
                    "error": None,
                    "stemCount": 1,
                    "trackCount": 1,
                },
                "upload": upload.model_dump(mode="json", by_alias=True),
                "currentStage": "completed",
                "statusMessage": "Completed.",
                "error": None,
                "draftSavedAt": None,
            }

            (source_dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
            (source_dir / "original-result.json").write_text(
                build_result().model_dump_json(by_alias=True, indent=2),
                encoding="utf-8",
            )

            with self.assertRaises(ProjectPackagingError) as context:
                project_packaging_service.open_local_project(str(source_dir))

        self.assertIn("must stay within the selected local project folder", str(context.exception))


if __name__ == "__main__":
    unittest.main()
