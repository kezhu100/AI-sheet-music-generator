from __future__ import annotations

from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import Settings
from app.models.schemas import StemAsset
from app.pipeline.drum_transcription import (
    DRUM_TRANSCRIPTION_PROVIDER_HEURISTIC,
    DRUM_TRANSCRIPTION_PROVIDER_MADMOM,
    DRUM_TRANSCRIPTION_PROVIDER_ML,
    FallbackDrumTranscriptionProvider,
    HeuristicWavDrumTranscriptionProvider,
    MadmomDrumTranscriptionProvider,
    build_drum_transcription_provider,
)
from app.pipeline.interfaces import SourceStem


class DrumTranscriptionProviderSelectionTests(unittest.TestCase):
    def test_build_drum_provider_uses_explicit_heuristic_provider(self) -> None:
        provider = build_drum_transcription_provider(
            Settings(
                drum_transcription_provider=DRUM_TRANSCRIPTION_PROVIDER_HEURISTIC,
            )
        )

        self.assertIsInstance(provider, HeuristicWavDrumTranscriptionProvider)

    def test_build_drum_provider_wraps_ml_provider_with_configured_fallback(self) -> None:
        provider = build_drum_transcription_provider(
            Settings(
                drum_transcription_provider=DRUM_TRANSCRIPTION_PROVIDER_ML,
                drum_transcription_fallback_provider=DRUM_TRANSCRIPTION_PROVIDER_HEURISTIC,
            )
        )

        self.assertIsInstance(provider, FallbackDrumTranscriptionProvider)

    def test_ml_provider_normalizes_drum_hits_into_noteevent_shape(self) -> None:
        provider = StubMadmomDrumProvider(
            onsets=[
                {"onsetSec": 0.1, "confidence": 0.95},
                [0.7, 0.7],
                1.4,
                {"onsetSec": -0.1, "confidence": 0.8},
            ]
        )

        with TemporaryDirectory() as temp_dir:
            stem_path = Path(temp_dir) / "drums.wav"
            self._write_test_stem(stem_path)
            result = provider.transcribe(_build_source_stem(stem_path))

        self.assertEqual(result.provider_name, "madmom-drum-provider")
        self.assertEqual(result.instrument, "drums")
        self.assertEqual(result.source_stem, "drum_stem")
        self.assertGreaterEqual(len(result.notes), 3)
        detected_labels = {note.drum_label for note in result.notes}
        self.assertIn("kick", detected_labels)
        self.assertIn("snare", detected_labels)
        self.assertIn("hi-hat", detected_labels)
        self.assertTrue(all(note.instrument == "drums" for note in result.notes))
        self.assertTrue(all(note.midi_note is not None for note in result.notes))
        self.assertTrue(all(note.velocity is not None for note in result.notes))
        self.assertTrue(all(note.confidence is not None for note in result.notes))
        self.assertTrue(all(note.bar is not None for note in result.notes))
        self.assertTrue(all(note.beat is not None for note in result.notes))

    def test_ml_provider_falls_back_to_heuristic_when_runtime_is_unavailable(self) -> None:
        provider = FallbackDrumTranscriptionProvider(
            primary=MadmomDrumTranscriptionProvider(python_executable="Z:/missing/python.exe"),
            fallback=HeuristicWavDrumTranscriptionProvider(),
        )

        with TemporaryDirectory() as temp_dir:
            stem_path = Path(temp_dir) / "drums.wav"
            self._write_test_stem(stem_path)
            result = provider.transcribe(_build_source_stem(stem_path))

        self.assertEqual(result.provider_name, "heuristic-wav-drum-provider")
        self.assertIn("Configured drum transcription provider 'madmom-drum-provider' was unavailable", result.warnings[0])
        self.assertIn(
            "Drum transcription is now a real heuristic MVP provider that consumes the persisted drum stem and currently supports only uncompressed PCM .wav stems.",
            result.warnings,
        )

    def _write_test_stem(self, target_path: Path) -> None:
        import math
        import wave

        sample_rate = 44100
        amplitude = 14000
        total_samples = int(sample_rate * 2.0)
        frames = [0 for _ in range(total_samples)]

        for label, onset_sec in (("kick", 0.1), ("snare", 0.7), ("hihat", 1.4)):
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
        import math

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


class StubMadmomDrumProvider(MadmomDrumTranscriptionProvider):
    def __init__(self, onsets: list[object]) -> None:
        super().__init__(python_executable=sys.executable)
        self._onsets = onsets

    def _run_madmom(self, audio_path: Path) -> list[object]:
        return list(self._onsets)


def _build_source_stem(stem_path: Path) -> SourceStem:
    return SourceStem(
        stem_name="drum_stem",
        instrument_hint="drums",
        file_path=stem_path,
        stem_asset=StemAsset(
            stemName="drum_stem",
            instrumentHint="drums",
            provider=DRUM_TRANSCRIPTION_PROVIDER_MADMOM,
            storedPath="data/stems/job-test/drums.wav",
            fileName=stem_path.name,
            fileFormat=stem_path.suffix.lstrip("."),
            sizeBytes=stem_path.stat().st_size,
        ),
    )


if __name__ == "__main__":
    unittest.main()
