from __future__ import annotations

from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import Settings
from app.models.schemas import StemAsset
from app.pipeline.interfaces import SourceStem
from app.pipeline.piano_transcription import (
    BasicPitchPianoTranscriptionProvider,
    FallbackPianoTranscriptionProvider,
    HeuristicWavPianoTranscriptionProvider,
    PIANO_TRANSCRIPTION_PROVIDER_BASIC_PITCH,
    PIANO_TRANSCRIPTION_PROVIDER_HEURISTIC,
    PIANO_TRANSCRIPTION_PROVIDER_ML,
    build_piano_transcription_provider,
)


class PianoTranscriptionProviderSelectionTests(unittest.TestCase):
    def test_build_piano_provider_uses_explicit_heuristic_provider(self) -> None:
        provider = build_piano_transcription_provider(
            Settings(
                piano_transcription_provider=PIANO_TRANSCRIPTION_PROVIDER_HEURISTIC,
            )
        )

        self.assertIsInstance(provider, HeuristicWavPianoTranscriptionProvider)

    def test_build_piano_provider_wraps_ml_provider_with_configured_fallback(self) -> None:
        provider = build_piano_transcription_provider(
            Settings(
                piano_transcription_provider=PIANO_TRANSCRIPTION_PROVIDER_ML,
                piano_transcription_fallback_provider=PIANO_TRANSCRIPTION_PROVIDER_HEURISTIC,
            )
        )

        self.assertIsInstance(provider, FallbackPianoTranscriptionProvider)

    def test_legacy_ml_alias_resolves_to_basic_pitch_provider(self) -> None:
        provider = build_piano_transcription_provider(
            Settings(
                piano_transcription_provider=PIANO_TRANSCRIPTION_PROVIDER_ML,
            )
        )

        self.assertIsInstance(provider, BasicPitchPianoTranscriptionProvider)

    def test_ml_provider_normalizes_note_events_into_noteevent_shape(self) -> None:
        provider = StubBasicPitchProvider(
            note_events=[
                {"startSec": 0.1, "endSec": 0.52, "pitch": 60, "confidence": 0.91},
                [0.7, 1.1, 64, 0.66],
                {"startSec": 1.2, "endSec": 1.22, "pitch": 67, "confidence": 0.95},
                {"startSec": 1.5, "endSec": 1.9, "pitch": 12, "confidence": 0.95},
                {"startSec": 2.0, "endSec": 2.4, "pitch": 67, "confidence": 0.1},
            ]
        )

        with TemporaryDirectory() as temp_dir:
            stem_path = Path(temp_dir) / "piano.wav"
            stem_path.write_bytes(b"placeholder")
            result = provider.transcribe(_build_source_stem(stem_path))

        self.assertEqual(result.provider_name, "basic-pitch-piano-provider")
        self.assertEqual(result.instrument, "piano")
        self.assertEqual(result.source_stem, "piano_stem")
        self.assertEqual(len(result.notes), 2)
        self.assertEqual([note.pitch for note in result.notes], [60, 64])
        self.assertTrue(all(note.instrument == "piano" for note in result.notes))
        self.assertTrue(all(note.source_stem == "piano_stem" for note in result.notes))
        self.assertTrue(all(note.velocity is not None for note in result.notes))
        self.assertTrue(all(note.confidence is not None for note in result.notes))

    def test_ml_provider_falls_back_to_heuristic_when_runtime_is_unavailable(self) -> None:
        provider = FallbackPianoTranscriptionProvider(
            primary=BasicPitchPianoTranscriptionProvider(python_executable="Z:/missing/python.exe"),
            fallback=HeuristicWavPianoTranscriptionProvider(),
        )

        with TemporaryDirectory() as temp_dir:
            stem_path = Path(temp_dir) / "piano.wav"
            stem_path.write_bytes(b"not-a-real-wav")
            result = provider.transcribe(_build_source_stem(stem_path))

        self.assertEqual(result.provider_name, "heuristic-wav-piano-provider")
        self.assertIn("Configured piano transcription provider 'basic-pitch-piano-provider' was unavailable", result.warnings[0])
        self.assertIn(
            "Piano transcription is a real heuristic MVP provider that currently supports only uncompressed PCM .wav stems.",
            result.warnings,
        )


class StubBasicPitchProvider(BasicPitchPianoTranscriptionProvider):
    def __init__(self, note_events: list[object]) -> None:
        super().__init__(python_executable=sys.executable)
        self._note_events = note_events

    def _run_basic_pitch(self, audio_path: Path) -> list[object]:
        return list(self._note_events)


def _build_source_stem(stem_path: Path) -> SourceStem:
    return SourceStem(
        stem_name="piano_stem",
        instrument_hint="piano",
        file_path=stem_path,
        stem_asset=StemAsset(
            stemName="piano_stem",
            instrumentHint="piano",
            provider=PIANO_TRANSCRIPTION_PROVIDER_BASIC_PITCH,
            storedPath="data/stems/job-test/piano.wav",
            fileName=stem_path.name,
            fileFormat=stem_path.suffix.lstrip("."),
            sizeBytes=stem_path.stat().st_size,
        ),
    )


if __name__ == "__main__":
    unittest.main()
