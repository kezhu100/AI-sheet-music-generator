from __future__ import annotations

from dataclasses import dataclass
from statistics import median

from app.models.schemas import NoteEvent, TrackResult
from app.pipeline.timing import absolute_beat_to_bar_beat, beats_to_seconds, quantize_seconds, seconds_to_beats


@dataclass(frozen=True)
class PostProcessingResult:
    bpm: int
    tracks: list[TrackResult]
    warnings: list[str]


class LightweightPostProcessor:
    def process(self, tracks: list[TrackResult], warnings: list[str]) -> PostProcessingResult:
        merged_tracks = self._merge_tracks(tracks)
        filtered_tracks: list[TrackResult] = []
        filtered_count = 0

        for track in merged_tracks:
            filtered_notes = self._filter_notes(track.notes)
            filtered_count += len(track.notes) - len(filtered_notes)
            filtered_tracks.append(
                TrackResult(
                    instrument=track.instrument,
                    sourceStem=track.source_stem,
                    provider=track.provider,
                    eventCount=len(filtered_notes),
                    notes=self._sort_notes(filtered_notes),
                )
            )

        bpm, tempo_warning = self._estimate_tempo(filtered_tracks)
        processed_tracks: list[TrackResult] = []

        for track in filtered_tracks:
            quantized_notes = [self._quantize_note(note, bpm) for note in track.notes]
            processed_tracks.append(
                TrackResult(
                    instrument=track.instrument,
                    sourceStem=track.source_stem,
                    provider=track.provider,
                    eventCount=len(quantized_notes),
                    notes=self._sort_notes(quantized_notes),
                )
            )

        output_warnings = list(warnings)
        if tempo_warning is not None and tempo_warning not in output_warnings:
            output_warnings.append(tempo_warning)
        if filtered_count > 0:
            output_warnings.append(
                f"Phase 5 post-processing filtered {filtered_count} low-confidence note events before returning the normalized result."
            )

        return PostProcessingResult(
            bpm=bpm,
            tracks=processed_tracks,
            warnings=output_warnings,
        )

    def _estimate_tempo(self, tracks: list[TrackResult]) -> tuple[int, str | None]:
        onset_times = sorted({round(note.onset_sec, 3) for track in tracks for note in track.notes})
        if len(onset_times) < 2:
            return 120, "Phase 5 post-processing could not estimate tempo from the current events, so the result fell back to 120 BPM."

        intervals = [right - left for left, right in zip(onset_times, onset_times[1:]) if 0.18 <= right - left <= 1.5]
        if not intervals:
            return 120, "Phase 5 post-processing could not derive a stable beat interval from the current events, so the result fell back to 120 BPM."

        candidate_bpms: list[int] = []
        for interval in intervals:
            bpm = 60.0 / interval
            while bpm < 72:
                bpm *= 2
            while bpm > 160:
                bpm /= 2
            candidate_bpms.append(int(round(bpm)))

        if not candidate_bpms:
            return 120, "Phase 5 post-processing could not normalize the detected tempo candidates, so the result fell back to 120 BPM."

        return int(round(median(candidate_bpms))), None

    def _merge_tracks(self, tracks: list[TrackResult]) -> list[TrackResult]:
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
                    notes=list(track.notes),
                )
                continue

            provider_name = existing.provider if track.provider == existing.provider else f"{existing.provider}+{track.provider}"
            merged[key] = TrackResult(
                instrument=existing.instrument,
                sourceStem=existing.source_stem,
                provider=provider_name,
                eventCount=existing.event_count + track.event_count,
                notes=[*existing.notes, *track.notes],
            )

        return list(merged.values())

    def _filter_notes(self, notes: list[NoteEvent]) -> list[NoteEvent]:
        filtered: list[NoteEvent] = []
        for note in notes:
            threshold = 0.45 if note.instrument == "drums" else 0.35
            if note.confidence is not None and note.confidence < threshold:
                continue
            filtered.append(note)
        return filtered

    def _quantize_note(self, note: NoteEvent, bpm: int) -> NoteEvent:
        quantized_onset = quantize_seconds(note.onset_sec, bpm)
        quantized_offset = note.offset_sec
        if note.offset_sec is not None:
            minimum_duration = self._minimum_note_duration(bpm)
            quantized_offset = max(
                quantized_onset + minimum_duration,
                quantize_seconds(note.offset_sec, bpm),
            )

        bar, beat = absolute_beat_to_bar_beat(seconds_to_beats(quantized_onset, bpm))
        return note.model_copy(
            update={
                "onset_sec": quantized_onset,
                "offset_sec": quantized_offset,
                "bar": bar,
                "beat": beat,
            }
        )

    def _minimum_note_duration(self, bpm: int) -> float:
        return beats_to_seconds(0.25, bpm)

    def _sort_notes(self, notes: list[NoteEvent]) -> list[NoteEvent]:
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
