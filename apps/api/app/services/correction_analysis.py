from __future__ import annotations

from collections import defaultdict
from statistics import median

from app.models.schemas import CorrectionSuggestedChange, CorrectionSuggestion, JobResult, NoteEvent, TrackResult
from app.pipeline.timing import quantize_seconds


class CorrectionAnalysisService:
    def analyze_draft(self, draft_result: JobResult) -> list[CorrectionSuggestion]:
        suggestions: list[CorrectionSuggestion] = []

        for track in draft_result.tracks:
            if track.instrument == "piano":
                suggestions.extend(self._detect_timing_anomalies(track, draft_result.bpm))
                suggestions.extend(self._detect_overlap_anomalies(track))
                suggestions.extend(self._detect_piano_pitch_anomalies(track))
                suggestions.extend(self._detect_velocity_anomalies(track))
            elif track.instrument == "drums":
                suggestions.extend(self._detect_timing_anomalies(track, draft_result.bpm))
                suggestions.extend(self._detect_velocity_anomalies(track))
                suggestions.extend(self._detect_drum_pattern_anomalies(track))

        return self._dedupe_suggestions(suggestions)

    def _detect_piano_pitch_anomalies(self, track: TrackResult) -> list[CorrectionSuggestion]:
        notes = [note for note in track.notes if note.draft_note_id and note.pitch is not None]
        suggestions: list[CorrectionSuggestion] = []

        for index, note in enumerate(notes):
            context = [
                candidate.pitch
                for candidate in notes[max(0, index - 2) : index + 3]
                if candidate.draft_note_id != note.draft_note_id and candidate.pitch is not None
            ]
            if len(context) < 3:
                continue

            context_median = int(round(median(context)))
            if abs(note.pitch - context_median) <= 12:
                continue

            previous_pitch = notes[index - 1].pitch if index > 0 else None
            next_pitch = notes[index + 1].pitch if index + 1 < len(notes) else None
            if previous_pitch is None or next_pitch is None:
                continue
            previous_gap = abs(note.pitch - previous_pitch)
            next_gap = abs(note.pitch - next_pitch)
            if previous_gap <= 12 or next_gap <= 12:
                continue

            neighboring_context_gaps = [
                abs(candidate.pitch - context_median)
                for candidate in (notes[index - 1], notes[index + 1])
                if candidate.pitch is not None
            ]
            if not neighboring_context_gaps or max(neighboring_context_gaps) > 5:
                continue

            suggestions.append(
                CorrectionSuggestion(
                    type="pitch",
                    instrument="piano",
                    noteId=note.draft_note_id,
                    message=f"Pitch is unusually far from the nearby piano context. Nearby median suggests {context_median}.",
                    suggestedChange=CorrectionSuggestedChange(pitch=context_median),
                )
            )

        return suggestions

    def _detect_timing_anomalies(self, track: TrackResult, bpm: int) -> list[CorrectionSuggestion]:
        suggestions: list[CorrectionSuggestion] = []
        threshold_sec = 0.045

        for note in track.notes:
            if not note.draft_note_id:
                continue

            quantized_onset = quantize_seconds(note.onset_sec, bpm, subdivision=4)
            delta = abs(note.onset_sec - quantized_onset)
            if delta <= threshold_sec:
                continue

            update: dict[str, float] = {"onset_sec": quantized_onset}
            if note.offset_sec is not None:
                duration = max(0.05, round(note.offset_sec - note.onset_sec, 3))
                update["offset_sec"] = round(quantized_onset + duration, 3)

            suggestions.append(
                CorrectionSuggestion(
                    type="timing",
                    instrument=track.instrument,
                    noteId=note.draft_note_id,
                    message=f"Onset is {delta:.3f}s away from the nearest sixteenth-note grid.",
                    suggestedChange=CorrectionSuggestedChange(**update),
                )
            )

        return suggestions

    def _detect_overlap_anomalies(self, track: TrackResult) -> list[CorrectionSuggestion]:
        by_pitch: dict[int, list[NoteEvent]] = defaultdict(list)
        for note in track.notes:
            if note.draft_note_id and note.pitch is not None:
                by_pitch[note.pitch].append(note)

        suggestions: list[CorrectionSuggestion] = []
        for pitch_notes in by_pitch.values():
            ordered = sorted(pitch_notes, key=lambda note: (note.onset_sec, note.offset_sec or note.onset_sec))
            for left, right in zip(ordered, ordered[1:]):
                left_end = left.offset_sec or left.onset_sec
                if left_end <= right.onset_sec:
                    continue

                overlap = left_end - right.onset_sec
                if overlap < 0.12:
                    continue

                trimmed_offset = round(max(left.onset_sec + 0.05, right.onset_sec), 3)
                suggestions.append(
                    CorrectionSuggestion(
                        type="timing",
                        instrument="piano",
                        noteId=left.draft_note_id,
                        message="Same-pitch piano notes overlap longer than expected. Trimming the earlier note may clean the draft.",
                        suggestedChange=CorrectionSuggestedChange(offsetSec=trimmed_offset),
                    )
                )

        return suggestions

    def _detect_drum_pattern_anomalies(self, track: TrackResult) -> list[CorrectionSuggestion]:
        onset_groups: dict[float, list[NoteEvent]] = defaultdict(list)
        for note in track.notes:
            if note.draft_note_id:
                onset_groups[round(note.onset_sec, 3)].append(note)

        suggestions: list[CorrectionSuggestion] = []
        for onset, notes in onset_groups.items():
            labels = {self._normalize_drum_label(note.drum_label) for note in notes}
            if len(notes) != 3 or labels != {"kick", "snare", "hi-hat"}:
                continue

            target = next((note for note in notes if self._normalize_drum_label(note.drum_label) == "hi-hat"), None)
            if target is None or target.draft_note_id is None:
                continue

            suggestions.append(
                CorrectionSuggestion(
                    type="drum-pattern",
                    instrument="drums",
                    noteId=target.draft_note_id,
                    message=f"Kick, snare, and hi-hat all stack at {onset:.3f}s. The hi-hat may be a false positive.",
                    suggestedChange=CorrectionSuggestedChange(drumLabel="snare", midiNote=38),
                )
            )

        return suggestions

    def _detect_velocity_anomalies(self, track: TrackResult) -> list[CorrectionSuggestion]:
        notes = [note for note in track.notes if note.draft_note_id and note.velocity is not None]
        suggestions: list[CorrectionSuggestion] = []

        for index, note in enumerate(notes):
            context = [
                candidate.velocity
                for candidate in notes[max(0, index - 2) : index + 3]
                if candidate.draft_note_id != note.draft_note_id and candidate.velocity is not None
            ]
            if len(context) < 3:
                continue

            context_median = int(round(median(context)))
            if abs(note.velocity - context_median) < 40:
                continue

            suggestions.append(
                CorrectionSuggestion(
                    type="velocity",
                    instrument=track.instrument,
                    noteId=note.draft_note_id,
                    message=f"Velocity is an outlier relative to nearby notes. Nearby median suggests {context_median}.",
                    suggestedChange=CorrectionSuggestedChange(velocity=context_median),
                )
            )

        return suggestions

    def _dedupe_suggestions(self, suggestions: list[CorrectionSuggestion]) -> list[CorrectionSuggestion]:
        deduped: list[CorrectionSuggestion] = []
        seen: set[tuple[str, str, str]] = set()

        for suggestion in suggestions:
            key = (suggestion.type, suggestion.instrument, suggestion.note_id)
            if key in seen:
                continue
            seen.add(key)
            deduped.append(suggestion)

        return deduped

    def _normalize_drum_label(self, drum_label: str | None) -> str:
        normalized = (drum_label or "").strip().lower()
        if normalized in {"hihat", "hi hat"}:
            return "hi-hat"
        return normalized
