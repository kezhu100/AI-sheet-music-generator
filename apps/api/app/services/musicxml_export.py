from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import xml.etree.ElementTree as ET

from app.models.schemas import JobResult, NoteEvent, TrackResult
from app.services.export_variants import ExportScope, build_export_suffix
from app.pipeline.timing import seconds_to_beats


DIVISIONS_PER_QUARTER = 4
BEATS_PER_BAR = 4
MEASURE_DURATION_DIVISIONS = DIVISIONS_PER_QUARTER * BEATS_PER_BAR
DEFAULT_DRUM_DURATION_DIVISIONS = 1


@dataclass(frozen=True)
class MusicXmlPart:
    id: str
    name: str
    track: TrackResult


@dataclass(frozen=True)
class NoteSegment:
    measure_number: int
    offset_divisions: int
    duration_divisions: int
    note: NoteEvent
    tie_start: bool
    tie_stop: bool


class MusicXmlExportError(Exception):
    pass


def build_musicxml_file(result: JobResult) -> bytes:
    if result.bpm <= 0:
        raise MusicXmlExportError("Cannot export MusicXML because the result BPM is invalid.")

    playable_tracks = [track for track in result.tracks if track.notes]
    if not playable_tracks:
        raise MusicXmlExportError("Cannot export MusicXML because there are no note events in the completed job result.")

    parts = [_build_part_descriptor(index, track) for index, track in enumerate(playable_tracks, start=1)]

    root = ET.Element("score-partwise", version="4.0")
    ET.SubElement(root, "work")
    work_title = ET.SubElement(root.find("work"), "work-title")
    work_title.text = result.project_name

    part_list = ET.SubElement(root, "part-list")
    for part in parts:
        _append_score_part(part_list, part)

    for part in parts:
        root.append(_build_part_element(part, result.bpm))

    xml_body = ET.tostring(root, encoding="utf-8")
    declaration = b'<?xml version="1.0" encoding="UTF-8"?>\n'
    doctype = (
        b'<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" '
        b'"http://www.musicxml.org/dtds/partwise.dtd">\n'
    )
    return declaration + doctype + xml_body


def build_musicxml_filename(project_name: str, scope: ExportScope = "combined") -> str:
    stem = Path(project_name).stem.strip() or "ai-sheet-music-generator"
    safe_name = "".join(character if character.isalnum() or character in {"-", "_"} else "-" for character in stem)
    return f"{safe_name}{build_export_suffix(scope)}.musicxml"


def _build_part_descriptor(index: int, track: TrackResult) -> MusicXmlPart:
    if track.instrument == "piano":
        name = "Piano"
    elif track.instrument == "drums":
        name = "Drums"
    else:
        name = track.instrument.title()

    return MusicXmlPart(id=f"P{index}", name=name, track=track)


def _append_score_part(part_list: ET.Element, part: MusicXmlPart) -> None:
    score_part = ET.SubElement(part_list, "score-part", id=part.id)
    ET.SubElement(score_part, "part-name").text = part.name
    score_instrument = ET.SubElement(score_part, "score-instrument", id=f"{part.id}-I1")
    ET.SubElement(score_instrument, "instrument-name").text = part.name
    midi_instrument = ET.SubElement(score_part, "midi-instrument", id=f"{part.id}-I1")
    ET.SubElement(midi_instrument, "midi-channel").text = "10" if part.track.instrument == "drums" else "1"
    ET.SubElement(midi_instrument, "midi-program").text = "1" if part.track.instrument != "drums" else "1"
    if part.track.instrument == "drums":
        ET.SubElement(midi_instrument, "midi-unpitched").text = "38"


def _build_part_element(part: MusicXmlPart, bpm: int) -> ET.Element:
    part_element = ET.Element("part", id=part.id)
    segments = _split_track_into_segments(part.track, bpm)
    max_measure = max((segment.measure_number for segment in segments), default=1)
    segments_by_measure: dict[int, list[NoteSegment]] = {}
    for segment in segments:
        segments_by_measure.setdefault(segment.measure_number, []).append(segment)

    for measure_number in range(1, max_measure + 1):
        measure = ET.SubElement(part_element, "measure", number=str(measure_number))
        if measure_number == 1:
            _append_measure_attributes(measure, part.track.instrument)
            _append_tempo_direction(measure, bpm)

        _append_measure_contents(measure, segments_by_measure.get(measure_number, []), part)

    return part_element


def _append_measure_attributes(measure: ET.Element, instrument: str) -> None:
    attributes = ET.SubElement(measure, "attributes")
    ET.SubElement(attributes, "divisions").text = str(DIVISIONS_PER_QUARTER)
    key = ET.SubElement(attributes, "key")
    ET.SubElement(key, "fifths").text = "0"
    time = ET.SubElement(attributes, "time")
    ET.SubElement(time, "beats").text = str(BEATS_PER_BAR)
    ET.SubElement(time, "beat-type").text = "4"

    clef = ET.SubElement(attributes, "clef")
    if instrument == "drums":
        ET.SubElement(clef, "sign").text = "percussion"
        ET.SubElement(clef, "line").text = "2"
    else:
        ET.SubElement(clef, "sign").text = "G"
        ET.SubElement(clef, "line").text = "2"


def _append_tempo_direction(measure: ET.Element, bpm: int) -> None:
    direction = ET.SubElement(measure, "direction", placement="above")
    direction_type = ET.SubElement(direction, "direction-type")
    metronome = ET.SubElement(direction_type, "metronome")
    ET.SubElement(metronome, "beat-unit").text = "quarter"
    ET.SubElement(metronome, "per-minute").text = str(bpm)
    ET.SubElement(direction, "sound", tempo=str(bpm))


def _append_measure_contents(measure: ET.Element, segments: list[NoteSegment], part: MusicXmlPart) -> None:
    if not segments:
        _append_rest(measure, MEASURE_DURATION_DIVISIONS)
        return

    ordered_segments = sorted(segments, key=lambda segment: (segment.offset_divisions, segment.note.id))
    current_position = 0
    index = 0

    while index < len(ordered_segments):
        group_start = ordered_segments[index].offset_divisions
        if group_start > current_position:
            _append_rest(measure, group_start - current_position)
            current_position = group_start

        chord_group: list[NoteSegment] = []
        while index < len(ordered_segments) and ordered_segments[index].offset_divisions == group_start:
            chord_group.append(ordered_segments[index])
            index += 1

        for chord_index, segment in enumerate(chord_group):
            _append_note(measure, segment, part, chord_index > 0)

        current_position = max(current_position, max(segment.offset_divisions + segment.duration_divisions for segment in chord_group))

    if current_position < MEASURE_DURATION_DIVISIONS:
        _append_rest(measure, MEASURE_DURATION_DIVISIONS - current_position)


def _append_rest(measure: ET.Element, duration_divisions: int) -> None:
    remaining = duration_divisions
    for chunk in _split_duration(duration_divisions):
        note = ET.SubElement(measure, "note")
        ET.SubElement(note, "rest")
        ET.SubElement(note, "duration").text = str(chunk)
        note_type, dots = _duration_to_type(chunk)
        if note_type is not None:
            ET.SubElement(note, "type").text = note_type
            for _ in range(dots):
                ET.SubElement(note, "dot")
        remaining -= chunk


def _append_note(measure: ET.Element, segment: NoteSegment, part: MusicXmlPart, is_chord_tone: bool) -> None:
    note_element = ET.SubElement(measure, "note")
    if is_chord_tone:
        ET.SubElement(note_element, "chord")

    if part.track.instrument == "drums":
        _append_unpitched(note_element, segment.note)
        ET.SubElement(note_element, "instrument", id=f"{part.id}-I1")
        if (segment.note.drum_label or "").lower() in {"hi-hat", "hihat"}:
            ET.SubElement(note_element, "notehead").text = "x"
    else:
        _append_pitch(note_element, segment.note)

    ET.SubElement(note_element, "duration").text = str(segment.duration_divisions)
    note_type, dots = _duration_to_type(segment.duration_divisions)
    if note_type is not None:
        ET.SubElement(note_element, "type").text = note_type
        for _ in range(dots):
            ET.SubElement(note_element, "dot")

    if segment.tie_stop:
        ET.SubElement(note_element, "tie", type="stop")
    if segment.tie_start:
        ET.SubElement(note_element, "tie", type="start")

    if segment.tie_start or segment.tie_stop:
        notations = ET.SubElement(note_element, "notations")
        if segment.tie_stop:
            ET.SubElement(notations, "tied", type="stop")
        if segment.tie_start:
            ET.SubElement(notations, "tied", type="start")

    ET.SubElement(note_element, "voice").text = "1"
    ET.SubElement(note_element, "staff").text = "1"


def _append_pitch(note_element: ET.Element, note: NoteEvent) -> None:
    midi_note = note.pitch
    if midi_note is None:
        raise MusicXmlExportError("Cannot export pitched MusicXML note because the MIDI pitch is missing.")

    step, alter, octave = _midi_to_pitch_components(midi_note)
    pitch = ET.SubElement(note_element, "pitch")
    ET.SubElement(pitch, "step").text = step
    if alter != 0:
        ET.SubElement(pitch, "alter").text = str(alter)
    ET.SubElement(pitch, "octave").text = str(octave)


def _append_unpitched(note_element: ET.Element, note: NoteEvent) -> None:
    display_step, display_octave = _drum_display_pitch(note)
    unpitched = ET.SubElement(note_element, "unpitched")
    ET.SubElement(unpitched, "display-step").text = display_step
    ET.SubElement(unpitched, "display-octave").text = str(display_octave)


def _split_track_into_segments(track: TrackResult, bpm: int) -> list[NoteSegment]:
    segments: list[NoteSegment] = []
    for note in track.notes:
        start_divisions = _seconds_to_divisions(note.onset_sec, bpm)
        end_divisions = _seconds_to_divisions(_resolve_offset(note, track.instrument, bpm), bpm)
        if end_divisions <= start_divisions:
            end_divisions = start_divisions + DEFAULT_DRUM_DURATION_DIVISIONS

        original_start = start_divisions
        original_end = end_divisions

        while start_divisions < original_end:
            measure_number = (start_divisions // MEASURE_DURATION_DIVISIONS) + 1
            measure_end = measure_number * MEASURE_DURATION_DIVISIONS
            segment_end = min(original_end, measure_end)
            segments.append(
                NoteSegment(
                    measure_number=measure_number,
                    offset_divisions=start_divisions % MEASURE_DURATION_DIVISIONS,
                    duration_divisions=max(1, segment_end - start_divisions),
                    note=note,
                    tie_start=segment_end < original_end,
                    tie_stop=start_divisions > original_start,
                )
            )
            start_divisions = segment_end

    return segments


def _seconds_to_divisions(seconds: float, bpm: int) -> int:
    return max(0, int(round(seconds_to_beats(seconds, bpm) * DIVISIONS_PER_QUARTER)))


def _resolve_offset(note: NoteEvent, instrument: str, bpm: int) -> float:
    if note.offset_sec is not None:
        return note.offset_sec

    if instrument == "drums":
        return note.onset_sec + (1 / DIVISIONS_PER_QUARTER) * (60.0 / bpm)

    return note.onset_sec + (1 / DIVISIONS_PER_QUARTER) * (60.0 / bpm)


def _duration_to_type(duration_divisions: int) -> tuple[str | None, int]:
    mapping = {
        1: ("16th", 0),
        2: ("eighth", 0),
        3: ("eighth", 1),
        4: ("quarter", 0),
        6: ("quarter", 1),
        8: ("half", 0),
        12: ("half", 1),
        16: ("whole", 0),
    }
    if duration_divisions in mapping:
        return mapping[duration_divisions]
    return None, 0


def _split_duration(duration_divisions: int) -> list[int]:
    chunks: list[int] = []
    remaining = duration_divisions
    supported = [16, 12, 8, 6, 4, 3, 2, 1]

    while remaining > 0:
        for value in supported:
            if value <= remaining:
                chunks.append(value)
                remaining -= value
                break

    return chunks


def _midi_to_pitch_components(midi_note: int) -> tuple[str, int, int]:
    note_names = [
        ("C", 0),
        ("C", 1),
        ("D", 0),
        ("D", 1),
        ("E", 0),
        ("F", 0),
        ("F", 1),
        ("G", 0),
        ("G", 1),
        ("A", 0),
        ("A", 1),
        ("B", 0),
    ]
    step, alter = note_names[midi_note % 12]
    octave = (midi_note // 12) - 1
    return step, alter, octave


def _drum_display_pitch(note: NoteEvent) -> tuple[str, int]:
    label = (note.drum_label or "").lower()
    mapping = {
        "kick": ("F", 4),
        "snare": ("C", 5),
        "hi-hat": ("G", 5),
        "hihat": ("G", 5),
    }
    return mapping.get(label, ("C", 5))
