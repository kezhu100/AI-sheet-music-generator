from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from shutil import copyfile, which
import subprocess
import wave

from app.core.config import Settings, get_settings

TARGET_SAMPLE_RATE = 44100
TARGET_CHANNELS = 2
TARGET_SAMPLE_WIDTH = 2
TARGET_FORMAT_DESCRIPTION = "44.1 kHz PCM 16-bit WAV"
FFMPEG_TIMEOUT_SECONDS = 300


class AudioPreprocessingError(RuntimeError):
    pass


class MissingFFmpegError(AudioPreprocessingError):
    pass


@dataclass(frozen=True)
class NormalizedAudioFile:
    path: Path
    warnings: list[str] = field(default_factory=list)


class LocalAudioPreprocessor:
    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()

    def normalize(self, audio_path: Path, original_file_name: str, job_id: str) -> NormalizedAudioFile:
        target_path = self._build_target_path(job_id)
        target_path.parent.mkdir(parents=True, exist_ok=True)

        if self._is_compatible_pcm_wav(audio_path):
            copyfile(audio_path, target_path)
            return NormalizedAudioFile(path=target_path)

        ffmpeg_executable = self._resolve_ffmpeg_executable()
        command = [
            ffmpeg_executable,
            "-y",
            "-i",
            str(audio_path),
            "-vn",
            "-f",
            "wav",
            "-acodec",
            "pcm_s16le",
            "-ar",
            str(TARGET_SAMPLE_RATE),
            "-ac",
            str(TARGET_CHANNELS),
            str(target_path),
        ]

        try:
            completed = subprocess.run(
                command,
                check=False,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=FFMPEG_TIMEOUT_SECONDS,
            )
        except subprocess.TimeoutExpired as exc:
            self._cleanup_partial_output(target_path)
            raise AudioPreprocessingError(
                f"Local audio normalization timed out for '{original_file_name}' after {FFMPEG_TIMEOUT_SECONDS} seconds."
            ) from exc
        except OSError as exc:
            self._cleanup_partial_output(target_path)
            raise AudioPreprocessingError(
                f"Failed to run ffmpeg while normalizing '{original_file_name}': {exc}"
            ) from exc

        if completed.returncode != 0:
            self._cleanup_partial_output(target_path)
            detail = completed.stderr.strip() or completed.stdout.strip() or "unknown error"
            raise AudioPreprocessingError(
                "Local audio normalization failed for "
                f"'{original_file_name}'. The app could not use its bundled ffmpeg and no working fallback was available. "
                "Retry with the bundled dependency installed, a valid FFMPEG_EXECUTABLE override, a system ffmpeg on PATH, "
                "or provide a compatible PCM WAV input. "
                f"ffmpeg exited with code {completed.returncode}: {detail}"
            )

        if not self._is_usable_normalized_output(target_path):
            self._cleanup_partial_output(target_path)
            raise AudioPreprocessingError(
                f"ffmpeg reported success for '{original_file_name}' but did not create a usable normalized WAV file."
            )

        return NormalizedAudioFile(
            path=target_path,
            warnings=[
                f"Audio normalization converted '{original_file_name}' into a local {TARGET_FORMAT_DESCRIPTION} intermediate before source separation and transcription.",
            ],
        )

    def _build_target_path(self, job_id: str) -> Path:
        return self._settings.stems_dir / job_id / "normalized_input.wav"

    def _cleanup_partial_output(self, target_path: Path) -> None:
        target_path.unlink(missing_ok=True)

    def _resolve_ffmpeg_executable(self) -> str:
        configured = self._settings.ffmpeg_executable
        if configured:
            if Path(configured).exists() or which(configured):
                return configured
            raise MissingFFmpegError(
                "ffmpeg is required for non-WAV or non-PCM audio normalization, but the configured "
                f"FFMPEG_EXECUTABLE was not found: '{configured}'. Update FFMPEG_EXECUTABLE, reinstall the bundled ffmpeg "
                "dependency, or use a system ffmpeg fallback."
            )

        discovered = which("ffmpeg")
        if discovered:
            return discovered

        raise MissingFFmpegError(
            "ffmpeg is required to normalize compressed or unsupported uploads into a stable PCM WAV intermediate. "
            "The app first looks for its bundled ffmpeg, then falls back to FFMPEG_EXECUTABLE or a system ffmpeg on PATH. "
            "Reinstall dependencies, provide a valid override, or upload a compatible PCM WAV file."
        )

    def _is_compatible_pcm_wav(self, audio_path: Path) -> bool:
        if audio_path.suffix.lower() != ".wav":
            return False

        try:
            with wave.open(str(audio_path), "rb") as wav_file:
                return (
                    wav_file.getcomptype() == "NONE"
                    and wav_file.getsampwidth() == TARGET_SAMPLE_WIDTH
                    and wav_file.getframerate() == TARGET_SAMPLE_RATE
                    and wav_file.getnchannels() in {1, TARGET_CHANNELS}
                )
        except (wave.Error, OSError):
            return False

    def _is_usable_normalized_output(self, audio_path: Path) -> bool:
        if not audio_path.exists() or audio_path.stat().st_size == 0:
            return False
        return self._is_compatible_pcm_wav(audio_path)
