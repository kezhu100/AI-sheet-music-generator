from __future__ import annotations

from dataclasses import dataclass
from statistics import median

from app.models.schemas import (
    MIN_NOTE_DURATION_SEC,
    NoteEvent,
    PianoPostProcessingSettings,
    ProcessingPreferences,
    TrackResult,
)
from app.pipeline.timing import (
    absolute_beat_to_bar_beat,
    beats_to_seconds,
    quantize_seconds,
    seconds_to_beats,
)

DEFAULT_BPM = 120
DEFAULT_BEAT_INTERVAL_SEC = 60.0 / DEFAULT_BPM
MIN_SUPPORTED_BPM = 72
MAX_SUPPORTED_BPM = 160
MIN_BEAT_INTERVAL_SEC = 60.0 / MAX_SUPPORTED_BPM
MAX_BEAT_INTERVAL_SEC = 60.0 / MIN_SUPPORTED_BPM
MIN_TEMPO_SAMPLE_INTERVAL_SEC = 0.18
MAX_TEMPO_SAMPLE_INTERVAL_SEC = 2.4
PIANO_CONFIDENCE_THRESHOLD = 0.35
DRUM_CONFIDENCE_THRESHOLD = 0.45
VERY_LOW_CONFIDENCE_THRESHOLD = 0.2
SHORT_PIANO_DURATION_SEC = 0.1
SHORT_PIANO_CONFIDENCE_THRESHOLD = 0.5
PIANO_CONSERVATIVE_MIN_PITCH = 24
PIANO_CONSERVATIVE_MAX_PITCH = 103
PIANO_STRICT_REGISTER_LOW_PITCH = 32
PIANO_STRICT_REGISTER_HIGH_PITCH = 96
PIANO_REGISTER_CONFIDENCE_THRESHOLD = 0.55
PIANO_ISOLATION_WINDOW_SEC = 0.45
PIANO_ISOLATION_MAX_PITCH_DISTANCE = 12
PIANO_ISOLATED_CONFIDENCE_THRESHOLD = 0.58
PIANO_ISOLATED_SHORT_DURATION_SEC = 0.14
PIANO_ISOLATED_LONG_DURATION_SEC = 3.8
PIANO_SUSPICIOUS_LONG_DURATION_SEC = 5.5
PIANO_MAX_DURATION_SEC = 8.0
PIANO_LONG_NOTE_CONFIDENCE_THRESHOLD = 0.78
PIANO_DUPLICATE_WINDOW_SEC = 0.08
DRUM_DUPLICATE_WINDOW_SEC = 0.05

# Presets intentionally stay conservative because this product favors
# quick verification and export handoff over destructive browser cleanup.
PIANO_POST_PROCESSING_PRESETS: dict[str, dict[str, float | bool]] = {
    "low": {
        "isolated_weak_note_threshold": 0.48,
        "duplicate_merge_tolerance_ms": 55,
        "overlap_trim_aggressiveness": 0.35,
        "extreme_note_filtering": False,
        "confidence_threshold": 0.24,
    },
    "medium": {
        "isolated_weak_note_threshold": 0.58,
        "duplicate_merge_tolerance_ms": 80,
        "overlap_trim_aggressiveness": 0.75,
        "extreme_note_filtering": True,
        "confidence_threshold": 0.35,
    },
    "high": {
        "isolated_weak_note_threshold": 0.68,
        "duplicate_merge_tolerance_ms": 110,
        "overlap_trim_aggressiveness": 1.0,
        "extreme_note_filtering": True,
        "confidence_threshold": 0.45,
    },
}


@dataclass(frozen=True)
class CleanupStats:
    low_confidence_filtered: int = 0
    piano_residual_filtered: int = 0
    invalid_timing_fixed: int = 0
    duplicates_removed: int = 0
    overlaps_trimmed: int = 0


@dataclass(frozen=True)
class TempoEstimate:
    bpm: int
    warning: str | None = None


@dataclass(frozen=True)
class QuantizationPlan:
    bpm: int
    subdivision: int


def build_piano_post_processing_settings_from_preset(
    preset: str,
    *,
    enabled: bool = True,
) -> PianoPostProcessingSettings:
    preset_values = PIANO_POST_PROCESSING_PRESETS[preset]
    return PianoPostProcessingSettings(
        enabled=enabled,
        preset=preset,
        basePreset=preset,
        isolatedWeakNoteThreshold=preset_values["isolated_weak_note_threshold"],
        duplicateMergeToleranceMs=preset_values["duplicate_merge_tolerance_ms"],
        overlapTrimAggressiveness=preset_values["overlap_trim_aggressiveness"],
        extremeNoteFiltering=preset_values["extreme_note_filtering"],
        confidenceThreshold=preset_values["confidence_threshold"],
    )


def resolve_piano_post_processing_settings(
    preferences: ProcessingPreferences | None = None,
) -> PianoPostProcessingSettings:
    if preferences is None:
        return PianoPostProcessingSettings()

    configured_settings = preferences.piano_post_processing
    if configured_settings.preset == "custom":
        return configured_settings

    return build_piano_post_processing_settings_from_preset(
        configured_settings.preset,
        enabled=configured_settings.enabled,
    )


def merge_tracks(tracks: list[TrackResult]) -> list[TrackResult]:
    merged: dict[tuple[str, str], TrackResult] = {}
    for track in tracks:
        key = (track.instrument, track.source_stem)
        existing = merged.get(key)
        if existing is None:
            merged[key] = TrackResult(
                instrument=track.instrument,
                sourceStem=track.source_stem,
                provider=track.provider,
                eventCount=track.event_count,
                notes=sort_notes(track.notes),
            )
            continue

        provider_names = sorted({*existing.provider.split("+"), *track.provider.split("+")})
        merged[key] = TrackResult(
            instrument=existing.instrument,
            sourceStem=existing.source_stem,
            provider="+".join(provider_names),
            eventCount=len(existing.notes) + len(track.notes),
            notes=sort_notes([*existing.notes, *track.notes]),
        )

    return sort_tracks(list(merged.values()))


def clean_track_notes(
    track: TrackResult,
    piano_settings: PianoPostProcessingSettings | None = None,
) -> tuple[list[NoteEvent], CleanupStats]:
    if track.instrument == "piano":
        resolved_piano_settings = piano_settings or PianoPostProcessingSettings()
        return _clean_piano_track_notes(track, resolved_piano_settings)

    cleaned: list[NoteEvent] = []
    low_confidence_filtered = 0
    invalid_timing_fixed = 0

    for note in sort_notes(track.notes):
        if _should_filter_note(note):
            low_confidence_filtered += 1
            continue

        normalized_note = note
        if note.offset_sec is not None and note.offset_sec <= note.onset_sec:
            normalized_note = note.model_copy(
                update={"offset_sec": round(note.onset_sec + MIN_NOTE_DURATION_SEC, 3)}
            )
            invalid_timing_fixed += 1

        cleaned.append(normalized_note)

    deduped_notes, duplicates_removed = _dedupe_notes(track.instrument, cleaned)
    return deduped_notes, CleanupStats(
        low_confidence_filtered=low_confidence_filtered,
        invalid_timing_fixed=invalid_timing_fixed,
        duplicates_removed=duplicates_removed,
    )


def estimate_tempo(tracks: list[TrackResult]) -> TempoEstimate:
    observations = _collect_onset_observations(tracks)
    if len(observations) < 2:
        return TempoEstimate(
            bpm=DEFAULT_BPM,
            warning="Phase 11D post-processing could not estimate tempo from the current events, so the result fell back to 120 BPM.",
        )

    interval_samples: list[tuple[float, float]] = []
    for index, (left_onset, left_weight) in enumerate(observations):
        for lookahead in range(index + 1, min(len(observations), index + 5)):
            right_onset, right_weight = observations[lookahead]
            interval = right_onset - left_onset
            if interval < MIN_TEMPO_SAMPLE_INTERVAL_SEC:
                continue
            if interval > MAX_TEMPO_SAMPLE_INTERVAL_SEC:
                break
            normalized_interval = _normalize_interval_to_beat_length(interval)
            weight = (left_weight + right_weight) / max(1, lookahead - index)
            interval_samples.append((normalized_interval, weight))

    if len(interval_samples) < 2:
        return TempoEstimate(
            bpm=DEFAULT_BPM,
            warning="Phase 11D post-processing could not derive a stable beat interval from the current events, so the result fell back to 120 BPM.",
        )

    interval_samples.sort(key=lambda item: item[0])
    weighted_interval = _weighted_median(interval_samples)
    support_weight = sum(weight for interval, weight in interval_samples if abs(interval - weighted_interval) <= 0.045)
    total_weight = sum(weight for _, weight in interval_samples)
    deviations = sorted(abs(interval - weighted_interval) for interval, _ in interval_samples)
    median_deviation = deviations[len(deviations) // 2]

    if total_weight <= 0:
        return TempoEstimate(
            bpm=DEFAULT_BPM,
            warning="Phase 11D post-processing could not normalize the detected tempo candidates, so the result fell back to 120 BPM.",
        )

    support_ratio = support_weight / total_weight
    if support_ratio < 0.3 or median_deviation > 0.09:
        return TempoEstimate(
            bpm=DEFAULT_BPM,
            warning="Phase 11D post-processing found sparse or noisy timing evidence, so the result fell back to 120 BPM.",
        )

    estimated_bpm = int(round(max(MIN_SUPPORTED_BPM, min(MAX_SUPPORTED_BPM, 60.0 / weighted_interval))))
    warning = None
    if support_ratio < 0.5 or median_deviation > 0.045:
        warning = (
            "Phase 11D post-processing estimated a single project tempo from limited timing evidence; beat alignment may still be approximate for expressive passages."
        )
    return TempoEstimate(bpm=estimated_bpm, warning=warning)


def choose_quantization_plan(tracks: list[TrackResult], bpm: int) -> QuantizationPlan:
    onsets = [note.onset_sec for track in tracks for note in track.notes]
    if len(onsets) < 2:
        return QuantizationPlan(bpm=bpm, subdivision=4)

    eighth_error = _average_quantization_error(onsets, bpm, subdivision=2)
    sixteenth_error = _average_quantization_error(onsets, bpm, subdivision=4)
    subdivision = 4 if sixteenth_error <= max(0.015, eighth_error * 0.8) else 2
    return QuantizationPlan(bpm=bpm, subdivision=subdivision)


def quantize_track_notes(
    track: TrackResult,
    plan: QuantizationPlan,
    piano_settings: PianoPostProcessingSettings | None = None,
) -> tuple[list[NoteEvent], CleanupStats]:
    quantized_notes: list[NoteEvent] = []
    for note in sort_notes(track.notes):
        quantized_notes.append(_quantize_note(note, plan))

    resolved_piano_settings = piano_settings or PianoPostProcessingSettings()
    if track.instrument == "piano" and not resolved_piano_settings.enabled:
        return sort_notes(quantized_notes), CleanupStats()

    deduped_notes, duplicates_removed = _dedupe_notes(track.instrument, quantized_notes, quantized=True)
    overlap_cleaned_notes, overlaps_trimmed = _trim_overlaps(
        track.instrument,
        deduped_notes,
        plan,
        resolved_piano_settings,
    )
    return sort_notes(overlap_cleaned_notes), CleanupStats(
        duplicates_removed=duplicates_removed,
        overlaps_trimmed=overlaps_trimmed,
    )


def summarize_cleanup_warnings(stats: CleanupStats) -> list[str]:
    warnings: list[str] = []
    if stats.low_confidence_filtered > 0:
        warnings.append(
            f"Phase 11D post-processing filtered {stats.low_confidence_filtered} low-confidence note events before returning the normalized result."
        )
    if stats.piano_residual_filtered > 0:
        warnings.append(
            f"Phase 11D post-processing removed {stats.piano_residual_filtered} suspicious piano note events that looked more like source-separation residuals than stable piano notes."
        )
    if stats.invalid_timing_fixed > 0:
        warnings.append(
            f"Phase 11D post-processing repaired {stats.invalid_timing_fixed} note events with non-positive durations before final normalization."
        )
    if stats.duplicates_removed > 0:
        warnings.append(
            f"Phase 11D post-processing removed {stats.duplicates_removed} near-duplicate note events while cleaning overlapping provider output."
        )
    if stats.overlaps_trimmed > 0:
        warnings.append(
            f"Phase 11D post-processing trimmed {stats.overlaps_trimmed} overlapping piano note durations to keep the final result more playable."
        )
    return warnings


def combine_cleanup_stats(*stats_items: CleanupStats) -> CleanupStats:
    return CleanupStats(
        low_confidence_filtered=sum(item.low_confidence_filtered for item in stats_items),
        piano_residual_filtered=sum(item.piano_residual_filtered for item in stats_items),
        invalid_timing_fixed=sum(item.invalid_timing_fixed for item in stats_items),
        duplicates_removed=sum(item.duplicates_removed for item in stats_items),
        overlaps_trimmed=sum(item.overlaps_trimmed for item in stats_items),
    )


def sort_notes(notes: list[NoteEvent]) -> list[NoteEvent]:
    return sorted(
        notes,
        key=lambda note: (
            note.onset_sec,
            note.offset_sec if note.offset_sec is not None else note.onset_sec,
            note.pitch if note.pitch is not None else -1,
            note.midi_note if note.midi_note is not None else -1,
            note.id,
        ),
    )


def sort_tracks(tracks: list[TrackResult]) -> list[TrackResult]:
    return sorted(tracks, key=lambda track: (track.instrument, track.source_stem, track.provider))


def _should_filter_note(
    note: NoteEvent,
    piano_settings: PianoPostProcessingSettings | None = None,
) -> bool:
    confidence = 1.0 if note.confidence is None else note.confidence
    if confidence < VERY_LOW_CONFIDENCE_THRESHOLD:
        return True

    threshold = DRUM_CONFIDENCE_THRESHOLD
    if note.instrument == "piano":
        resolved_piano_settings = piano_settings or PianoPostProcessingSettings()
        threshold = resolved_piano_settings.confidence_threshold
    if confidence < threshold:
        return True

    if note.instrument == "piano" and note.offset_sec is not None:
        duration = note.offset_sec - note.onset_sec
        short_note_threshold = max(
            SHORT_PIANO_CONFIDENCE_THRESHOLD,
            threshold,
        )
        if duration < SHORT_PIANO_DURATION_SEC and confidence < short_note_threshold:
            return True

    return False


def _clean_piano_track_notes(
    track: TrackResult,
    settings: PianoPostProcessingSettings,
) -> tuple[list[NoteEvent], CleanupStats]:
    sorted_notes = sort_notes(track.notes)
    if not settings.enabled:
        normalized_notes: list[NoteEvent] = []
        invalid_timing_fixed = 0
        for note in sorted_notes:
            normalized_note = note
            if note.offset_sec is not None and note.offset_sec <= note.onset_sec:
                normalized_note = note.model_copy(
                    update={"offset_sec": round(note.onset_sec + MIN_NOTE_DURATION_SEC, 3)}
                )
                invalid_timing_fixed += 1
            normalized_notes.append(normalized_note)

        return normalized_notes, CleanupStats(invalid_timing_fixed=invalid_timing_fixed)

    cleaned: list[NoteEvent] = []
    low_confidence_filtered = 0
    piano_residual_filtered = 0
    invalid_timing_fixed = 0

    for index, note in enumerate(sorted_notes):
        if _should_filter_note(note, settings):
            low_confidence_filtered += 1
            continue

        if _should_filter_piano_residual(note, sorted_notes, index, settings):
            piano_residual_filtered += 1
            continue

        normalized_note = note
        if note.offset_sec is not None and note.offset_sec <= note.onset_sec:
            normalized_note = note.model_copy(
                update={"offset_sec": round(note.onset_sec + MIN_NOTE_DURATION_SEC, 3)}
            )
            invalid_timing_fixed += 1

        cleaned.append(normalized_note)

    deduped_notes, duplicates_removed = _dedupe_notes(
        track.instrument,
        cleaned,
        duplicate_window_sec=settings.duplicate_merge_tolerance_ms / 1000.0,
    )
    return deduped_notes, CleanupStats(
        low_confidence_filtered=low_confidence_filtered,
        piano_residual_filtered=piano_residual_filtered,
        invalid_timing_fixed=invalid_timing_fixed,
        duplicates_removed=duplicates_removed,
    )


def _should_filter_piano_residual(
    note: NoteEvent,
    notes: list[NoteEvent],
    index: int,
    settings: PianoPostProcessingSettings,
) -> bool:
    pitch = note.pitch
    if pitch is None:
        return False

    confidence = 1.0 if note.confidence is None else max(0.0, min(1.0, note.confidence))
    duration = _note_duration(note)
    has_local_support = _has_piano_local_support(notes, index)
    is_extreme_register = pitch < PIANO_STRICT_REGISTER_LOW_PITCH or pitch > PIANO_STRICT_REGISTER_HIGH_PITCH

    if (
        settings.extreme_note_filtering
        and (pitch < PIANO_CONSERVATIVE_MIN_PITCH or pitch > PIANO_CONSERVATIVE_MAX_PITCH)
        and confidence < PIANO_REGISTER_CONFIDENCE_THRESHOLD
    ):
        return True

    if duration >= PIANO_MAX_DURATION_SEC:
        return True

    if duration >= PIANO_SUSPICIOUS_LONG_DURATION_SEC and confidence < PIANO_LONG_NOTE_CONFIDENCE_THRESHOLD:
        return True

    if not has_local_support:
        if confidence < settings.isolated_weak_note_threshold and (
            duration <= PIANO_ISOLATED_SHORT_DURATION_SEC or duration >= PIANO_ISOLATED_LONG_DURATION_SEC
        ):
            return True
        if settings.extreme_note_filtering and is_extreme_register and confidence < PIANO_REGISTER_CONFIDENCE_THRESHOLD:
            return True

    return False


def _has_piano_local_support(notes: list[NoteEvent], index: int) -> bool:
    current = notes[index]
    current_pitch = current.pitch
    if current_pitch is None:
        return False

    for neighbor_index, neighbor in enumerate(notes):
        if neighbor_index == index or neighbor.pitch is None:
            continue
        if abs(neighbor.onset_sec - current.onset_sec) > PIANO_ISOLATION_WINDOW_SEC:
            continue
        if abs(neighbor.pitch - current_pitch) <= PIANO_ISOLATION_MAX_PITCH_DISTANCE:
            return True

    return False


def _collect_onset_observations(tracks: list[TrackResult]) -> list[tuple[float, float]]:
    onset_weights: dict[float, float] = {}
    for track in tracks:
        track_weight = 1.1 if track.instrument == "drums" else 1.0
        for note in track.notes:
            confidence = 0.75 if note.confidence is None else max(0.0, min(1.0, note.confidence))
            rounded_onset = round(note.onset_sec, 3)
            onset_weights[rounded_onset] = max(onset_weights.get(rounded_onset, 0.0), 0.3 + confidence * track_weight)

    return sorted(onset_weights.items(), key=lambda item: item[0])


def _normalize_interval_to_beat_length(interval: float) -> float:
    normalized = interval
    while normalized < MIN_BEAT_INTERVAL_SEC:
        normalized *= 2
    while normalized > MAX_BEAT_INTERVAL_SEC:
        normalized /= 2
    return normalized


def _weighted_median(samples: list[tuple[float, float]]) -> float:
    total_weight = sum(weight for _, weight in samples)
    midpoint = total_weight / 2
    cumulative_weight = 0.0
    for value, weight in samples:
        cumulative_weight += weight
        if cumulative_weight >= midpoint:
            return value
    return samples[-1][0]


def _average_quantization_error(onsets: list[float], bpm: int, subdivision: int) -> float:
    errors: list[float] = []
    for onset in onsets:
        quantized = quantize_seconds(onset, bpm, subdivision=subdivision)
        errors.append(abs(quantized - onset))
    return median(errors) if errors else 0.0


def _quantize_note(note: NoteEvent, plan: QuantizationPlan) -> NoteEvent:
    quantized_onset = quantize_seconds(note.onset_sec, plan.bpm, subdivision=plan.subdivision)
    quantized_offset = note.offset_sec

    if note.offset_sec is not None:
        minimum_duration = _minimum_note_duration(note.instrument, plan.bpm, plan.subdivision)
        quantized_offset = max(
            round(quantized_onset + minimum_duration, 3),
            quantize_seconds(note.offset_sec, plan.bpm, subdivision=plan.subdivision),
        )

    bar, beat = absolute_beat_to_bar_beat(seconds_to_beats(quantized_onset, plan.bpm))
    return note.model_copy(
        update={
            "onset_sec": quantized_onset,
            "offset_sec": quantized_offset,
            "bar": bar,
            "beat": beat,
        }
    )


def _minimum_note_duration(instrument: str, bpm: int, subdivision: int) -> float:
    if instrument == "drums":
        return max(MIN_NOTE_DURATION_SEC, beats_to_seconds(0.25, bpm))
    return max(MIN_NOTE_DURATION_SEC, beats_to_seconds(1 / subdivision, bpm))


def _dedupe_notes(
    instrument: str,
    notes: list[NoteEvent],
    quantized: bool = False,
    duplicate_window_sec: float | None = None,
) -> tuple[list[NoteEvent], int]:
    if not notes:
        return [], 0

    duplicates_removed = 0
    output: list[NoteEvent] = []
    duplicate_window = duplicate_window_sec
    if duplicate_window is None:
        duplicate_window = DRUM_DUPLICATE_WINDOW_SEC if instrument == "drums" else PIANO_DUPLICATE_WINDOW_SEC
    if quantized:
        duplicate_window = 0.001

    for note in notes:
        if not output:
            output.append(note)
            continue

        previous = output[-1]
        if not _notes_can_conflict(note, previous):
            output.append(note)
            continue

        if abs(note.onset_sec - previous.onset_sec) > duplicate_window:
            output.append(note)
            continue

        better_note = _pick_better_note(previous, note)
        output[-1] = better_note
        duplicates_removed += 1

    return output, duplicates_removed


def _notes_can_conflict(left: NoteEvent, right: NoteEvent) -> bool:
    if left.instrument != right.instrument:
        return False
    if left.instrument == "drums":
        return left.midi_note == right.midi_note
    return left.pitch == right.pitch


def _pick_better_note(left: NoteEvent, right: NoteEvent) -> NoteEvent:
    left_score = _note_quality_score(left)
    right_score = _note_quality_score(right)
    if right_score > left_score:
        return right
    if left_score > right_score:
        return left

    left_duration = _note_duration(left)
    right_duration = _note_duration(right)
    if right_duration > left_duration:
        return right
    return left


def _note_quality_score(note: NoteEvent) -> tuple[float, int]:
    confidence = -1.0 if note.confidence is None else note.confidence
    velocity = -1 if note.velocity is None else note.velocity
    return confidence, velocity


def _note_duration(note: NoteEvent) -> float:
    if note.offset_sec is None:
        return 0.0
    return max(0.0, round(note.offset_sec - note.onset_sec, 6))


def _trim_overlaps(
    instrument: str,
    notes: list[NoteEvent],
    plan: QuantizationPlan,
    piano_settings: PianoPostProcessingSettings | None = None,
) -> tuple[list[NoteEvent], int]:
    if instrument != "piano":
        return notes, 0

    resolved_piano_settings = piano_settings or PianoPostProcessingSettings()
    aggressiveness = max(0.0, min(1.0, resolved_piano_settings.overlap_trim_aggressiveness))
    if aggressiveness <= 0:
        return notes, 0

    trimmed_count = 0
    output: list[NoteEvent] = []
    last_by_pitch: dict[int, int] = {}

    for note in notes:
        pitch = note.pitch
        if pitch is None or note.offset_sec is None:
            output.append(note)
            continue

        previous_index = last_by_pitch.get(pitch)
        if previous_index is not None:
            previous_note = output[previous_index]
            if previous_note.offset_sec is not None and previous_note.offset_sec > note.onset_sec:
                minimum_duration = _minimum_note_duration("piano", plan.bpm, plan.subdivision)
                overlap_sec = previous_note.offset_sec - note.onset_sec
                minimum_overlap_to_trim = minimum_duration * (1.0 - aggressiveness)
                if overlap_sec <= minimum_overlap_to_trim:
                    last_by_pitch[pitch] = len(output)
                    output.append(note)
                    continue

                trimmed_offset = round(max(previous_note.onset_sec + minimum_duration, note.onset_sec), 3)
                if trimmed_offset < previous_note.offset_sec:
                    output[previous_index] = previous_note.model_copy(update={"offset_sec": trimmed_offset})
                    trimmed_count += 1

        last_by_pitch[pitch] = len(output)
        output.append(note)

    return output, trimmed_count
