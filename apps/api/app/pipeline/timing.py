from __future__ import annotations


DEFAULT_BEATS_PER_BAR = 4
DEFAULT_QUANTIZATION_SUBDIVISION = 4


def bpm_to_beat_duration(bpm: int) -> float:
    if bpm <= 0:
        return 0.0
    return 60.0 / bpm


def seconds_to_beats(seconds: float, bpm: int) -> float:
    beat_duration = bpm_to_beat_duration(bpm)
    if beat_duration <= 0:
        return 0.0
    return seconds / beat_duration


def beats_to_seconds(beats: float, bpm: int) -> float:
    return beats * bpm_to_beat_duration(bpm)


def quantize_beat(beat_position: float, subdivision: int = DEFAULT_QUANTIZATION_SUBDIVISION) -> float:
    if subdivision <= 0:
        return round(beat_position, 6)
    return round(round(beat_position * subdivision) / subdivision, 6)


def quantize_seconds(seconds: float, bpm: int, subdivision: int = DEFAULT_QUANTIZATION_SUBDIVISION) -> float:
    quantized_beats = quantize_beat(seconds_to_beats(seconds, bpm), subdivision)
    return round(beats_to_seconds(quantized_beats, bpm), 3)


def absolute_beat_to_bar_beat(absolute_beat: float, beats_per_bar: int = DEFAULT_BEATS_PER_BAR) -> tuple[int, float]:
    safe_beats_per_bar = max(1, beats_per_bar)
    beat_index = int(absolute_beat)
    bar = (beat_index // safe_beats_per_bar) + 1
    beat = round((absolute_beat % safe_beats_per_bar) + 1, 2)
    return bar, beat
