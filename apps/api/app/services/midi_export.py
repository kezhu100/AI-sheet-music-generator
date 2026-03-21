from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from app.models.schemas import JobResult, NoteEvent, TrackResult
from app.services.export_variants import ExportScope, build_export_suffix
from app.pipeline.timing import beats_to_seconds, seconds_to_beats


TICKS_PER_QUARTER = 480
DEFAULT_DRUM_NOTE_DURATION_BEATS = 0.25


@dataclass(frozen=True)
class MidiTrackData:
    name: str
    channel: int
    events: bytes


class MidiExportError(Exception):
    pass


def build_midi_file(result: JobResult) -> bytes:
    if result.bpm <= 0:
        raise MidiExportError("Cannot export MIDI because the result BPM is invalid.")

    playable_tracks = [track for track in result.tracks if track.notes]
    if not playable_tracks:
        raise MidiExportError("Cannot export MIDI because there are no note events in the completed job result.")

    midi_tracks = [_build_tempo_track(result.bpm)]
    midi_tracks.extend(_build_note_track(track, result.bpm) for track in playable_tracks)

    header = _build_header(track_count=len(midi_tracks))
    chunks = [header, *(_build_track_chunk(track.events) for track in midi_tracks)]
    return b"".join(chunks)


def build_midi_filename(project_name: str, scope: ExportScope = "combined") -> str:
    stem = Path(project_name).stem.strip() or "ai-sheet-music-generator"
    safe_name = "".join(character if character.isalnum() or character in {"-", "_"} else "-" for character in stem)
    return f"{safe_name}{build_export_suffix(scope)}.mid"


def _build_header(track_count: int) -> bytes:
    return b"MThd" + (6).to_bytes(4, byteorder="big") + (1).to_bytes(2, byteorder="big") + track_count.to_bytes(
        2, byteorder="big"
    ) + TICKS_PER_QUARTER.to_bytes(2, byteorder="big")


def _build_tempo_track(bpm: int) -> MidiTrackData:
    microseconds_per_quarter = int(round(60_000_000 / bpm))
    events = bytearray()
    events.extend(_encode_vlq(0))
    events.extend(b"\xFF\x03")
    events.extend(_encode_vlq(len("Tempo")))
    events.extend(b"Tempo")
    events.extend(_encode_vlq(0))
    events.extend(b"\xFF\x51\x03")
    events.extend(microseconds_per_quarter.to_bytes(3, byteorder="big"))
    events.extend(_encode_end_of_track())
    return MidiTrackData(name="Tempo", channel=0, events=bytes(events))


def _build_note_track(track: TrackResult, bpm: int) -> MidiTrackData:
    channel = _resolve_channel(track)
    note_events = _build_note_events(track.notes, bpm, channel)
    events = bytearray()

    events.extend(_encode_vlq(0))
    track_name = f"{track.instrument}-{track.source_stem}"
    track_name_bytes = track_name.encode("utf-8")
    events.extend(b"\xFF\x03")
    events.extend(_encode_vlq(len(track_name_bytes)))
    events.extend(track_name_bytes)

    previous_tick = 0
    for absolute_tick, payload in note_events:
        delta = max(0, absolute_tick - previous_tick)
        events.extend(_encode_vlq(delta))
        events.extend(payload)
        previous_tick = absolute_tick

    events.extend(_encode_end_of_track())
    return MidiTrackData(name=track_name, channel=channel, events=bytes(events))


def _build_note_events(notes: list[NoteEvent], bpm: int, channel: int) -> list[tuple[int, bytes]]:
    output: list[tuple[int, bytes]] = []

    for note in notes:
        midi_note = _resolve_midi_note(note)
        if midi_note is None:
            continue

        velocity = _resolve_velocity(note)
        onset_tick = _seconds_to_ticks(note.onset_sec, bpm)
        offset_tick = _seconds_to_ticks(_resolve_offset(note, bpm), bpm)
        if offset_tick <= onset_tick:
            offset_tick = onset_tick + max(1, _seconds_to_ticks(beats_to_seconds(DEFAULT_DRUM_NOTE_DURATION_BEATS, bpm), bpm))

        output.append((onset_tick, bytes([0x90 | channel, midi_note, velocity])))
        output.append((offset_tick, bytes([0x80 | channel, midi_note, 0])))

    return sorted(output, key=lambda item: (item[0], 0 if (item[1][0] & 0xF0) == 0x80 else 1, item[1][1]))


def _resolve_channel(track: TrackResult) -> int:
    if track.instrument == "drums":
        return 9
    return 0


def _resolve_midi_note(note: NoteEvent) -> int | None:
    if note.instrument == "drums":
        midi_note = note.midi_note
    else:
        midi_note = note.pitch

    if midi_note is None:
        return None
    return max(0, min(127, midi_note))


def _resolve_velocity(note: NoteEvent) -> int:
    velocity = note.velocity if note.velocity is not None else 80
    return max(1, min(127, velocity))


def _resolve_offset(note: NoteEvent, bpm: int) -> float:
    if note.offset_sec is not None:
        return note.offset_sec
    return note.onset_sec + beats_to_seconds(DEFAULT_DRUM_NOTE_DURATION_BEATS, bpm)


def _seconds_to_ticks(seconds: float, bpm: int) -> int:
    beats = seconds_to_beats(seconds, bpm)
    return max(0, int(round(beats * TICKS_PER_QUARTER)))


def _build_track_chunk(track_data: bytes) -> bytes:
    return b"MTrk" + len(track_data).to_bytes(4, byteorder="big") + track_data


def _encode_end_of_track() -> bytes:
    return _encode_vlq(0) + b"\xFF\x2F\x00"


def _encode_vlq(value: int) -> bytes:
    safe_value = max(0, value)
    buffer = [safe_value & 0x7F]
    safe_value >>= 7

    while safe_value > 0:
        buffer.append((safe_value & 0x7F) | 0x80)
        safe_value >>= 7

    return bytes(reversed(buffer))
