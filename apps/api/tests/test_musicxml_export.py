from __future__ import annotations

import math
from pathlib import Path
from tempfile import TemporaryDirectory
import sys
import unittest
import wave
import xml.etree.ElementTree as ET

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app
from app.pipeline.development_pipeline import build_development_pipeline
from app.services.job_store import job_store
from app.services.musicxml_export import build_musicxml_file, build_musicxml_filename


class MusicXmlExportTests(unittest.TestCase):
    def test_build_musicxml_file_returns_score_partwise_document(self) -> None:
        result = self._build_result()

        musicxml_bytes = build_musicxml_file(result)
        xml_root = ET.fromstring(musicxml_bytes)

        self.assertEqual(xml_root.tag, "score-partwise")
        self.assertIsNotNone(xml_root.find("part-list"))
        self.assertGreaterEqual(len(xml_root.findall("part")), 2)

    def test_export_endpoint_returns_musicxml_download(self) -> None:
        result = self._build_result()
        job = job_store.create("upload-musicxml-test")
        job_store.complete(job.id, result)

        client = TestClient(app)
        response = client.get(f"/api/v1/jobs/{job.id}/exports/musicxml")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["content-type"], "application/vnd.recordare.musicxml+xml")
        self.assertIn(build_musicxml_filename(result.project_name), response.headers["content-disposition"])
        self.assertTrue(response.text.startswith('<?xml version="1.0" encoding="UTF-8"?>'))

    def _build_result(self):
        with TemporaryDirectory() as temp_dir:
            audio_path = Path(temp_dir) / "demo.wav"
            self._write_test_clip(audio_path)
            return build_development_pipeline().run(audio_path, "demo.wav", "job-musicxml")

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
