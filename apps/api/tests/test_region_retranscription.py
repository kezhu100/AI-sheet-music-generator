from __future__ import annotations

import math
import os
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import unittest
import wave

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import get_settings
from app.main import app
from app.models.schemas import JobResult, ProviderPreferences
from app.services.job_store import job_store
from app.services.storage import persist_stem_copy


class RegionRetranscriptionApiTests(unittest.TestCase):
    def test_valid_piano_region_request_returns_normalized_notes(self) -> None:
        with TemporaryDirectory() as temp_dir:
            job = self._build_completed_job(Path(temp_dir), "region-piano-job")
            response = TestClient(app).post(
                f"/api/v1/jobs/{job.id}/retranscribe-region",
                json={"instrument": "piano", "startSec": 0.0, "endSec": 1.35},
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["instrument"], "piano")
        self.assertTrue(payload["providerUsed"])
        self.assertGreaterEqual(len(payload["notes"]), 1)
        self.assertTrue(all(note["instrument"] == "piano" for note in payload["notes"]))
        self.assertTrue(all(note["sourceStem"] == "piano_stem" for note in payload["notes"]))
        self.assertTrue(all(note["bar"] is not None for note in payload["notes"]))
        self.assertTrue(all(note["beat"] is not None for note in payload["notes"]))
        self.assertTrue(all(0.0 <= note["onsetSec"] < 1.35 for note in payload["notes"]))

    def test_valid_drum_region_request_returns_absolute_normalized_notes(self) -> None:
        with TemporaryDirectory() as temp_dir:
            job = self._build_completed_job(Path(temp_dir), "region-drum-job")
            response = TestClient(app).post(
                f"/api/v1/jobs/{job.id}/retranscribe-region",
                json={"instrument": "drums", "startSec": 1.45, "endSec": 2.9},
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["instrument"], "drums")
        self.assertTrue(payload["providerUsed"])
        self.assertGreaterEqual(len(payload["notes"]), 1)
        self.assertTrue(all(note["instrument"] == "drums" for note in payload["notes"]))
        self.assertTrue(all(note["sourceStem"] == "drum_stem" for note in payload["notes"]))
        self.assertTrue(all(note["onsetSec"] >= 1.45 for note in payload["notes"]))
        self.assertTrue(all(note["onsetSec"] < 2.9 for note in payload["notes"]))

    def test_valid_empty_region_returns_success_with_no_notes(self) -> None:
        with TemporaryDirectory() as temp_dir:
            job = self._build_completed_job(Path(temp_dir), "region-empty-job")
            response = TestClient(app).post(
                f"/api/v1/jobs/{job.id}/retranscribe-region",
                json={"instrument": "piano", "startSec": 2.92, "endSec": 2.99},
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["instrument"], "piano")
        self.assertEqual(payload["startSec"], 2.92)
        self.assertEqual(payload["endSec"], 2.99)
        self.assertTrue(payload["providerUsed"])
        self.assertEqual(payload["notes"], [])

    def test_invalid_time_range_returns_validation_error(self) -> None:
        response = TestClient(app).post(
            "/api/v1/jobs/missing/retranscribe-region",
            json={"instrument": "piano", "startSec": 1.0, "endSec": 1.0},
        )

        self.assertEqual(response.status_code, 422)

    def test_missing_and_incomplete_jobs_return_errors(self) -> None:
        missing_response = TestClient(app).post(
            "/api/v1/jobs/missing/retranscribe-region",
            json={"instrument": "piano", "startSec": 0.0, "endSec": 1.0},
        )
        self.assertEqual(missing_response.status_code, 404)

        job = job_store.create("upload-region-incomplete")
        incomplete_response = TestClient(app).post(
            f"/api/v1/jobs/{job.id}/retranscribe-region",
            json={"instrument": "piano", "startSec": 0.0, "endSec": 1.0},
        )
        self.assertEqual(incomplete_response.status_code, 409)

    def test_region_retranscription_uses_provider_fallback_when_primary_is_unavailable(self) -> None:
        previous_env = {
            "PIANO_TRANSCRIPTION_PROVIDER": os.getenv("PIANO_TRANSCRIPTION_PROVIDER"),
            "PIANO_TRANSCRIPTION_FALLBACK_PROVIDER": os.getenv("PIANO_TRANSCRIPTION_FALLBACK_PROVIDER"),
            "PIANO_TRANSCRIPTION_ML_PYTHON": os.getenv("PIANO_TRANSCRIPTION_ML_PYTHON"),
        }

        os.environ["PIANO_TRANSCRIPTION_PROVIDER"] = "ml"
        os.environ["PIANO_TRANSCRIPTION_FALLBACK_PROVIDER"] = "heuristic"
        os.environ["PIANO_TRANSCRIPTION_ML_PYTHON"] = str(Path("Z:/missing-basic-pitch-python.exe"))
        get_settings.cache_clear()

        try:
            with TemporaryDirectory() as temp_dir:
                job = self._build_completed_job(Path(temp_dir), "region-fallback-job")
                response = TestClient(app).post(
                    f"/api/v1/jobs/{job.id}/retranscribe-region",
                    json={"instrument": "piano", "startSec": 0.0, "endSec": 1.35},
                )
        finally:
            for key, value in previous_env.items():
                if value is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = value
            get_settings.cache_clear()

        self.assertEqual(response.status_code, 200)
        self.assertGreaterEqual(len(response.json()["notes"]), 1)
        self.assertIn("providerUsed", response.json())

    def test_region_retranscription_uses_persisted_provider_preferences_instead_of_current_defaults(self) -> None:
        previous_env = {
            "PIANO_TRANSCRIPTION_PROVIDER": os.getenv("PIANO_TRANSCRIPTION_PROVIDER"),
            "PIANO_TRANSCRIPTION_FALLBACK_PROVIDER": os.getenv("PIANO_TRANSCRIPTION_FALLBACK_PROVIDER"),
            "PIANO_TRANSCRIPTION_ML_PYTHON": os.getenv("PIANO_TRANSCRIPTION_ML_PYTHON"),
        }

        os.environ["PIANO_TRANSCRIPTION_PROVIDER"] = "heuristic"
        os.environ.pop("PIANO_TRANSCRIPTION_FALLBACK_PROVIDER", None)
        os.environ["PIANO_TRANSCRIPTION_ML_PYTHON"] = str(Path("Z:/missing-basic-pitch-python.exe"))
        get_settings.cache_clear()

        try:
            with TemporaryDirectory() as temp_dir:
                job = self._build_completed_job(
                    Path(temp_dir),
                    "region-persisted-provider-job",
                    provider_preferences=ProviderPreferences(
                        pianoTranscription="basic-pitch",
                    ),
                )
                response = TestClient(app).post(
                    f"/api/v1/jobs/{job.id}/retranscribe-region",
                    json={"instrument": "piano", "startSec": 0.0, "endSec": 1.35},
                )
        finally:
            for key, value in previous_env.items():
                if value is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = value
            get_settings.cache_clear()

        self.assertEqual(response.status_code, 422)
        self.assertIn("configured piano provider", response.json()["detail"])

    def _build_completed_job(
        self,
        temp_dir: Path,
        job_id: str,
        provider_preferences: ProviderPreferences | None = None,
    ):
        source_wav = temp_dir / f"{job_id}.wav"
        self._write_test_clip(source_wav)

        piano_stem = persist_stem_copy(
            source_path=source_wav,
            job_id=job_id,
            stem_name="piano_stem",
            instrument_hint="piano",
            provider="test-stem-provider",
        )
        drum_stem = persist_stem_copy(
            source_path=source_wav,
            job_id=job_id,
            stem_name="drum_stem",
            instrument_hint="drums",
            provider="test-stem-provider",
        )

        result = JobResult.model_validate(
            {
                "projectName": job_id,
                "bpm": 120,
                "stems": [
                    piano_stem.model_dump(mode="python", by_alias=True),
                    drum_stem.model_dump(mode="python", by_alias=True),
                ],
                "warnings": [],
                "tracks": [
                    {
                        "instrument": "piano",
                        "sourceStem": "piano_stem",
                        "provider": "heuristic",
                        "eventCount": 1,
                        "notes": [
                            {
                                "id": "seed-piano",
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

        job = job_store.create(f"upload-{job_id}", provider_preferences)
        job_store.complete(job.id, result)
        return job

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


if __name__ == "__main__":
    unittest.main()
