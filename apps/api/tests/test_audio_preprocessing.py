from __future__ import annotations

from pathlib import Path
from tempfile import TemporaryDirectory
import subprocess
import sys
import unittest
import wave
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import Settings
from app.models.schemas import NoteEvent, StemAsset
from app.pipeline.development_pipeline import DevelopmentProcessingPipeline
from app.pipeline.interfaces import SourceSeparationRunResult, SourceStem, TranscriptionResult
from app.pipeline.post_processing import LightweightPostProcessor
from app.services.audio_preprocessing import (
    FFMPEG_TIMEOUT_SECONDS,
    LocalAudioPreprocessor,
    MissingFFmpegError,
)
from app.services.piano_stem_filtering import PianoStemFilterResult


class RecordingSourceSeparationProvider:
    provider_name = "recording-separation"

    def __init__(self, normalized_source: Path) -> None:
        self.normalized_source = normalized_source
        self.received_paths: list[Path] = []

    def separate(self, audio_path: Path, job_id: str) -> SourceSeparationRunResult:
        self.received_paths.append(audio_path)
        stems = [
            self._build_stem("piano_stem", "piano", job_id),
            self._build_stem("drum_stem", "drums", job_id),
        ]
        return SourceSeparationRunResult(
            provider_name=self.provider_name,
            stems=stems,
            warnings=[],
        )

    def _build_stem(self, stem_name: str, instrument_hint: str, job_id: str) -> SourceStem:
        stem_asset = StemAsset(
            stemName=stem_name,
            instrumentHint=instrument_hint,
            provider=self.provider_name,
            storedPath=f"data/stems/{job_id}/{stem_name}.wav",
            fileName=f"{stem_name}.wav",
            fileFormat="wav",
            sizeBytes=self.normalized_source.stat().st_size if self.normalized_source.exists() else 0,
        )
        return SourceStem(
            stem_name=stem_name,
            instrument_hint=instrument_hint,
            file_path=self.normalized_source,
            stem_asset=stem_asset,
        )


class FakePianoProvider:
    provider_name = "fake-piano"

    def transcribe(self, stem: SourceStem) -> TranscriptionResult:
        return TranscriptionResult(
            provider_name=self.provider_name,
            instrument="piano",
            source_stem=stem.stem_name,
            notes=[
                NoteEvent(
                    id=f"{stem.stem_name}-p1",
                    instrument="piano",
                    pitch=60,
                    onsetSec=0.0,
                    offsetSec=0.5,
                    velocity=96,
                    confidence=0.9,
                    sourceStem=stem.stem_name,
                )
            ],
            warnings=[],
        )


class FakeDrumProvider:
    provider_name = "fake-drums"

    def transcribe(self, stem: SourceStem) -> TranscriptionResult:
        return TranscriptionResult(
            provider_name=self.provider_name,
            instrument="drums",
            source_stem=stem.stem_name,
            notes=[
                NoteEvent(
                    id=f"{stem.stem_name}-d1",
                    instrument="drums",
                    drumLabel="kick",
                    midiNote=36,
                    onsetSec=0.5,
                    offsetSec=0.6,
                    velocity=96,
                    confidence=0.9,
                    sourceStem=stem.stem_name,
                )
            ],
            warnings=[],
        )


class PassthroughPianoStemFilterService:
    def build_filtered_piano_stem(
        self,
        *,
        stem: SourceStem,
        job_id: str,
        preferences=None,
    ) -> PianoStemFilterResult:
        return PianoStemFilterResult(
            transcription_stem=stem,
            exported_stems=[stem.stem_asset],
            warnings=[],
        )


class AudioPreprocessingTests(unittest.TestCase):
    def test_mp3_input_is_normalized_before_downstream_processing(self) -> None:
        with TemporaryDirectory() as temp_dir:
            settings = self._build_settings(Path(temp_dir))
            audio_path = settings.uploads_dir / "demo.mp3"
            audio_path.write_bytes(b"fake-mp3")
            normalized_path = settings.stems_dir / "job-mp3" / "normalized_input.wav"
            separation_provider = RecordingSourceSeparationProvider(normalized_path)
            pipeline = self._build_pipeline(settings, separation_provider)

            def fake_run(command, check, capture_output, text, timeout, encoding=None, errors=None):  # type: ignore[no-untyped-def]
                output_path = Path(command[-1])
                output_path.parent.mkdir(parents=True, exist_ok=True)
                self._write_test_wav(output_path)
                return subprocess.CompletedProcess(command, 0, "", "")

            with patch("app.services.audio_preprocessing.which", return_value="ffmpeg"), patch(
                "app.services.audio_preprocessing.subprocess.run",
                side_effect=fake_run,
            ):
                result = pipeline.run(audio_path, "demo.mp3", "job-mp3")

                self.assertEqual(separation_provider.received_paths, [normalized_path])
                self.assertTrue(normalized_path.exists())
                self.assertIn(
                    "Audio normalization converted 'demo.mp3' into a local 44.1 kHz PCM 16-bit WAV intermediate before source separation and transcription.",
                    result.warnings,
                )

        self.assertEqual({track.instrument for track in result.tracks}, {"piano", "drums"})

    def test_compatible_wav_input_still_works_without_ffmpeg(self) -> None:
        with TemporaryDirectory() as temp_dir:
            settings = self._build_settings(Path(temp_dir))
            audio_path = settings.uploads_dir / "demo.wav"
            self._write_test_wav(audio_path)
            normalized_path = settings.stems_dir / "job-wav" / "normalized_input.wav"
            separation_provider = RecordingSourceSeparationProvider(normalized_path)
            pipeline = self._build_pipeline(settings, separation_provider)

            with patch("app.services.audio_preprocessing.subprocess.run") as mocked_run:
                result = pipeline.run(audio_path, "demo.wav", "job-wav")
                self.assertEqual(separation_provider.received_paths, [normalized_path])
                self.assertTrue(normalized_path.exists())

        mocked_run.assert_not_called()
        self.assertFalse(any("Audio normalization converted 'demo.wav'" in warning for warning in result.warnings))

    def test_missing_ffmpeg_fails_clearly_before_source_separation(self) -> None:
        with TemporaryDirectory() as temp_dir:
            settings = self._build_settings(Path(temp_dir))
            audio_path = settings.uploads_dir / "demo.mp3"
            audio_path.write_bytes(b"fake-mp3")
            normalized_path = settings.stems_dir / "job-missing-ffmpeg" / "normalized_input.wav"
            separation_provider = RecordingSourceSeparationProvider(normalized_path)
            pipeline = self._build_pipeline(settings, separation_provider)

            with patch("app.services.audio_preprocessing.which", return_value=None):
                with self.assertRaises(MissingFFmpegError) as context:
                    pipeline.run(audio_path, "demo.mp3", "job-missing-ffmpeg")

        self.assertEqual(separation_provider.received_paths, [])
        self.assertIn("bundled ffmpeg", str(context.exception))
        self.assertIn("FFMPEG_EXECUTABLE", str(context.exception))

    def test_configured_ffmpeg_executable_is_used_when_present(self) -> None:
        with TemporaryDirectory() as temp_dir:
            settings = self._build_settings(Path(temp_dir))
            configured_ffmpeg = Path(temp_dir) / "bin" / "ffmpeg"
            configured_ffmpeg.parent.mkdir(parents=True, exist_ok=True)
            configured_ffmpeg.write_text("fake-binary", encoding="utf-8")
            settings = settings.model_copy(update={"ffmpeg_executable": str(configured_ffmpeg)})
            audio_path = settings.uploads_dir / "configured.mp3"
            audio_path.write_bytes(b"fake-mp3")
            preprocessor = LocalAudioPreprocessor(settings)
            captured_command: list[str] = []

            def fake_run(command, check, capture_output, text, timeout, encoding=None, errors=None):  # type: ignore[no-untyped-def]
                nonlocal captured_command
                captured_command = list(command)
                output_path = Path(command[-1])
                output_path.parent.mkdir(parents=True, exist_ok=True)
                self._write_test_wav(output_path)
                return subprocess.CompletedProcess(command, 0, "", "")

            with patch("app.services.audio_preprocessing.which", return_value=None), patch(
                "app.services.audio_preprocessing.subprocess.run",
                side_effect=fake_run,
            ):
                preprocessor.normalize(audio_path, "configured.mp3", "job-configured-ffmpeg")

        self.assertEqual(captured_command[0], str(configured_ffmpeg))

    def test_failed_ffmpeg_run_does_not_leave_partial_intermediate_or_continue(self) -> None:
        with TemporaryDirectory() as temp_dir:
            settings = self._build_settings(Path(temp_dir))
            audio_path = settings.uploads_dir / "broken.m4a"
            audio_path.write_bytes(b"broken-audio")
            normalized_path = settings.stems_dir / "job-failed-ffmpeg" / "normalized_input.wav"
            separation_provider = RecordingSourceSeparationProvider(normalized_path)
            pipeline = self._build_pipeline(settings, separation_provider)

            def fake_run(command, check, capture_output, text, timeout, encoding=None, errors=None):  # type: ignore[no-untyped-def]
                output_path = Path(command[-1])
                output_path.parent.mkdir(parents=True, exist_ok=True)
                output_path.write_bytes(b"partial")
                return subprocess.CompletedProcess(command, 1, "", "invalid data found when processing input")

            with patch("app.services.audio_preprocessing.which", return_value="ffmpeg"), patch(
                "app.services.audio_preprocessing.subprocess.run",
                side_effect=fake_run,
            ):
                with self.assertRaisesRegex(Exception, "Local audio normalization failed"):
                    pipeline.run(audio_path, "broken.m4a", "job-failed-ffmpeg")
                self.assertFalse(normalized_path.exists())

        self.assertEqual(separation_provider.received_paths, [])

    def test_ffmpeg_timeout_cleans_partial_output_and_stops_pipeline(self) -> None:
        with TemporaryDirectory() as temp_dir:
            settings = self._build_settings(Path(temp_dir))
            audio_path = settings.uploads_dir / "hung.aac"
            audio_path.write_bytes(b"hung-audio")
            normalized_path = settings.stems_dir / "job-timeout" / "normalized_input.wav"
            separation_provider = RecordingSourceSeparationProvider(normalized_path)
            pipeline = self._build_pipeline(settings, separation_provider)

            def fake_run(command, check, capture_output, text, timeout, encoding=None, errors=None):  # type: ignore[no-untyped-def]
                output_path = Path(command[-1])
                output_path.parent.mkdir(parents=True, exist_ok=True)
                output_path.write_bytes(b"partial")
                raise subprocess.TimeoutExpired(command, timeout)

            with patch("app.services.audio_preprocessing.which", return_value="ffmpeg"), patch(
                "app.services.audio_preprocessing.subprocess.run",
                side_effect=fake_run,
            ):
                with self.assertRaisesRegex(
                    Exception,
                    f"timed out for 'hung.aac' after {FFMPEG_TIMEOUT_SECONDS} seconds",
                ):
                    pipeline.run(audio_path, "hung.aac", "job-timeout")
                self.assertFalse(normalized_path.exists())

        self.assertEqual(separation_provider.received_paths, [])

    def test_false_success_invalid_wav_is_removed_and_raises(self) -> None:
        with TemporaryDirectory() as temp_dir:
            settings = self._build_settings(Path(temp_dir))
            audio_path = settings.uploads_dir / "invalid.flac"
            audio_path.write_bytes(b"fake-flac")
            preprocessor = LocalAudioPreprocessor(settings)
            normalized_path = settings.stems_dir / "job-invalid-success" / "normalized_input.wav"

            def fake_run(command, check, capture_output, text, timeout, encoding=None, errors=None):  # type: ignore[no-untyped-def]
                output_path = Path(command[-1])
                output_path.parent.mkdir(parents=True, exist_ok=True)
                output_path.write_bytes(b"not-a-real-wav")
                return subprocess.CompletedProcess(command, 0, "", "")

            with patch("app.services.audio_preprocessing.which", return_value="ffmpeg"), patch(
                "app.services.audio_preprocessing.subprocess.run",
                side_effect=fake_run,
            ):
                with self.assertRaisesRegex(Exception, "did not create a usable normalized WAV file"):
                    preprocessor.normalize(audio_path, "invalid.flac", "job-invalid-success")
                self.assertFalse(normalized_path.exists())

    def test_ffmpeg_command_is_explicit_about_output_shape(self) -> None:
        with TemporaryDirectory() as temp_dir:
            settings = self._build_settings(Path(temp_dir))
            audio_path = settings.uploads_dir / "explicit.mp3"
            audio_path.write_bytes(b"fake-mp3")
            preprocessor = LocalAudioPreprocessor(settings)
            captured_command: list[str] = []

            def fake_run(command, check, capture_output, text, timeout, encoding=None, errors=None):  # type: ignore[no-untyped-def]
                nonlocal captured_command
                captured_command = list(command)
                output_path = Path(command[-1])
                output_path.parent.mkdir(parents=True, exist_ok=True)
                self._write_test_wav(output_path)
                return subprocess.CompletedProcess(command, 0, "", "")

            with patch("app.services.audio_preprocessing.which", return_value="ffmpeg"), patch(
                "app.services.audio_preprocessing.subprocess.run",
                side_effect=fake_run,
            ):
                preprocessor.normalize(audio_path, "explicit.mp3", "job-explicit")

        self.assertIn("pcm_s16le", captured_command)
        self.assertIn("44100", captured_command)
        self.assertIn("2", captured_command)
        self.assertIn("wav", captured_command)

    def _build_pipeline(
        self,
        settings: Settings,
        separation_provider: RecordingSourceSeparationProvider,
    ) -> DevelopmentProcessingPipeline:
        return DevelopmentProcessingPipeline(
            separation_provider=separation_provider,
            piano_provider=FakePianoProvider(),
            drum_provider=FakeDrumProvider(),
            post_processor=LightweightPostProcessor(),
            audio_preprocessor=LocalAudioPreprocessor(settings),
            piano_stem_filter_service=PassthroughPianoStemFilterService(),
        )

    def _build_settings(self, root: Path) -> Settings:
        uploads_dir = root / "data" / "uploads"
        stems_dir = root / "data" / "stems"
        drafts_dir = root / "data" / "drafts"
        projects_dir = root / "data" / "projects"
        uploads_dir.mkdir(parents=True, exist_ok=True)
        stems_dir.mkdir(parents=True, exist_ok=True)
        drafts_dir.mkdir(parents=True, exist_ok=True)
        projects_dir.mkdir(parents=True, exist_ok=True)
        return Settings(
            project_root=root,
            data_dir=root / "data",
            uploads_dir=uploads_dir,
            stems_dir=stems_dir,
            drafts_dir=drafts_dir,
            projects_dir=projects_dir,
        )

    def _write_test_wav(self, target_path: Path) -> None:
        target_path.parent.mkdir(parents=True, exist_ok=True)
        with wave.open(str(target_path), "wb") as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(44100)
            wav_file.writeframes(b"\x00\x00" * 44100)


if __name__ == "__main__":
    unittest.main()
