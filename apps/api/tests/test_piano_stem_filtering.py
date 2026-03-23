from __future__ import annotations

import math
from pathlib import Path
from tempfile import TemporaryDirectory
import shutil
import sys
import unittest
import wave

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.models.schemas import JobResult, NoteEvent, ProcessingPreferences, StemAsset
from app.core.config import get_settings
from app.pipeline.development_pipeline import DevelopmentProcessingPipeline
from app.pipeline.interfaces import SourceSeparationRunResult, SourceStem, TranscriptionResult
from app.pipeline.post_processing import LightweightPostProcessor
from app.services.audio_preprocessing import NormalizedAudioFile
from app.services.piano_stem_filtering import (
    PianoStemFilterService,
    build_piano_filter_settings_from_preset,
)


class PianoStemFilteringTests(unittest.TestCase):
    def tearDown(self) -> None:
        shutil.rmtree(get_settings().stems_dir / "test-job", ignore_errors=True)

    def test_service_persists_filtered_and_raw_piano_stems(self) -> None:
        with TemporaryDirectory() as temp_dir:
            source_path = Path(temp_dir) / "piano.wav"
            self._write_test_wav(source_path)
            raw_asset = StemAsset(
                stemName="piano_stem",
                instrumentHint="piano",
                provider="demucs-separation",
                storedPath="data/stems/test-job/piano_stem.wav",
                fileName="piano_stem.wav",
                fileFormat="wav",
                sizeBytes=source_path.stat().st_size,
            )
            source_stem = SourceStem(
                stem_name="piano_stem",
                instrument_hint="piano",
                file_path=source_path,
                stem_asset=raw_asset,
            )

            result = PianoStemFilterService().build_filtered_piano_stem(
                stem=source_stem,
                job_id="test-job",
                preferences=ProcessingPreferences(
                    pianoFilter={
                        "enabled": True,
                        "lowCutHz": 70,
                        "highCutHz": 6000,
                        "cleanupStrength": 0.6,
                    }
                ),
            )

        self.assertEqual(result.transcription_stem.stem_name, "piano_stem")
        self.assertTrue(result.transcription_stem.file_path.name.endswith("piano_stem_filtered.wav"))
        self.assertEqual({stem.stem_name for stem in result.exported_stems}, {"piano_stem", "piano_stem_raw"})
        self.assertTrue(any("filtered piano stem" in warning for warning in result.warnings))

    def test_pipeline_uses_filtered_piano_stem_for_transcription_input(self) -> None:
        with TemporaryDirectory() as temp_dir:
            source_path = Path(temp_dir) / "piano.wav"
            self._write_test_wav(source_path)
            raw_asset = StemAsset(
                stemName="piano_stem",
                instrumentHint="piano",
                provider="demucs-separation",
                storedPath="data/stems/test-job/piano_stem.wav",
                fileName="piano_stem.wav",
                fileFormat="wav",
                sizeBytes=source_path.stat().st_size,
            )
            drum_asset = StemAsset(
                stemName="drum_stem",
                instrumentHint="drums",
                provider="demucs-separation",
                storedPath="data/stems/test-job/drum_stem.wav",
                fileName="drum_stem.wav",
                fileFormat="wav",
                sizeBytes=source_path.stat().st_size,
            )

            class StubSeparationProvider:
                def separate(self, audio_path: Path, job_id: str) -> SourceSeparationRunResult:
                    return SourceSeparationRunResult(
                        provider_name="stub-separation",
                        stems=[
                            SourceStem("piano_stem", "piano", source_path, raw_asset),
                            SourceStem("drum_stem", "drums", source_path, drum_asset),
                        ],
                    )

            class RecordingPianoProvider:
                provider_name = "recording-piano"

                def __init__(self) -> None:
                    self.last_stem_path: Path | None = None
                    self.last_stem_name: str | None = None

                def transcribe(self, stem: SourceStem) -> TranscriptionResult:
                    self.last_stem_path = stem.file_path
                    self.last_stem_name = stem.stem_name
                    return TranscriptionResult(
                        provider_name=self.provider_name,
                        instrument="piano",
                        source_stem=stem.stem_name,
                        notes=[
                            NoteEvent(
                                id="piano-note",
                                instrument="piano",
                                pitch=60,
                                onsetSec=0.0,
                                offsetSec=0.4,
                                confidence=0.9,
                                sourceStem=stem.stem_name,
                            )
                        ],
                    )

            class StubDrumProvider:
                provider_name = "stub-drum"

                def transcribe(self, stem: SourceStem) -> TranscriptionResult:
                    return TranscriptionResult(
                        provider_name=self.provider_name,
                        instrument="drums",
                        source_stem=stem.stem_name,
                        notes=[
                            NoteEvent(
                                id="drum-note",
                                instrument="drums",
                                drumLabel="kick",
                                midiNote=36,
                                onsetSec=0.5,
                                offsetSec=0.58,
                                confidence=0.9,
                                sourceStem=stem.stem_name,
                            )
                        ],
                    )

            class StubAudioPreprocessor:
                def normalize(self, audio_path: Path, original_file_name: str, job_id: str) -> NormalizedAudioFile:
                    return NormalizedAudioFile(path=audio_path)

            piano_provider = RecordingPianoProvider()
            pipeline = DevelopmentProcessingPipeline(
                separation_provider=StubSeparationProvider(),
                piano_provider=piano_provider,
                drum_provider=StubDrumProvider(),
                post_processor=LightweightPostProcessor(),
                audio_preprocessor=StubAudioPreprocessor(),
                piano_stem_filter_service=PianoStemFilterService(),
            )

            result: JobResult = pipeline.run(
                source_path,
                "demo.wav",
                "test-job",
                ProcessingPreferences(
                    pianoFilter={
                        "enabled": True,
                        "lowCutHz": 60,
                        "highCutHz": 6500,
                        "cleanupStrength": 0.55,
                    }
                ),
            )

        self.assertIsNotNone(piano_provider.last_stem_path)
        self.assertEqual(piano_provider.last_stem_name, "piano_stem")
        self.assertTrue(str(piano_provider.last_stem_path).endswith("piano_stem_filtered.wav"))
        self.assertEqual({stem.stem_name for stem in result.stems}, {"piano_stem", "piano_stem_raw", "drum_stem"})

    def test_low_medium_and_high_pre_processing_presets_expose_distinct_backend_values(self) -> None:
        low = build_piano_filter_settings_from_preset("low")
        medium = build_piano_filter_settings_from_preset("medium")
        high = build_piano_filter_settings_from_preset("high")

        self.assertLess(low.low_cut_hz, medium.low_cut_hz)
        self.assertLess(medium.low_cut_hz, high.low_cut_hz)
        self.assertGreater(low.high_cut_hz, medium.high_cut_hz)
        self.assertGreater(medium.high_cut_hz, high.high_cut_hz)
        self.assertLess(low.cleanup_strength, medium.cleanup_strength)
        self.assertLess(medium.cleanup_strength, high.cleanup_strength)

    def test_legacy_raw_pre_processing_values_load_as_custom_settings(self) -> None:
        preferences = ProcessingPreferences.model_validate(
            {
                "pianoFilter": {
                    "enabled": True,
                    "lowCutHz": 65,
                    "highCutHz": 6400,
                    "cleanupStrength": 0.55,
                }
            }
        )

        self.assertEqual(preferences.piano_filter.preset, "custom")
        self.assertEqual(preferences.piano_filter.base_preset, "medium")
        self.assertEqual(preferences.piano_filter.low_cut_hz, 65)
        self.assertEqual(preferences.piano_filter.high_cut_hz, 6400)
        self.assertEqual(preferences.piano_filter.cleanup_strength, 0.55)

    def _write_test_wav(self, path: Path) -> None:
        sample_rate = 44100
        duration_sec = 1.2
        frame_count = int(sample_rate * duration_sec)
        frames: list[int] = []
        for index in range(frame_count):
            time_sec = index / sample_rate
            piano = math.sin(2 * math.pi * 440 * time_sec) * 0.35
            bass_bleed = math.sin(2 * math.pi * 55 * time_sec) * 0.2
            high_bleed = math.sin(2 * math.pi * 8800 * time_sec) * 0.12
            mixed = piano + bass_bleed + high_bleed
            frames.append(max(-32768, min(32767, int(mixed * 32767))))

        with wave.open(str(path), "wb") as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(sample_rate)
            wav_file.writeframes(b"".join(int(sample).to_bytes(2, byteorder="little", signed=True) for sample in frames))


if __name__ == "__main__":
    unittest.main()
