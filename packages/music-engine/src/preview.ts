import type { NoteEvent, TrackResult } from "@ai-sheet-music-generator/shared-types";
import { absoluteBeatToBarBeat, secondsToBeats } from "./timing.js";

const NATURAL_NOTE_INDEX_BY_PITCH_CLASS = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export interface PreviewTrack {
  key: string;
  label: string;
  instrument: TrackResult["instrument"];
  sourceStem: string;
  provider: string;
  eventCount: number;
  notes: NoteEvent[];
}

export interface PreviewTimeBounds {
  startSec: number;
  endSec: number;
  durationSec: number;
}

export interface PreviewMeasure {
  bar: number;
  notes: NoteEvent[];
}

export interface DrumLane {
  key: string;
  label: string;
  midiNote?: number;
  notes: NoteEvent[];
}

export interface StaffPlacement {
  clef: "treble" | "bass";
  stepOffset: number;
}

export interface ResolvedBarBeat {
  bar: number;
  beat: number;
}

export function getTrackKey(track: Pick<TrackResult, "instrument" | "sourceStem" | "provider">): string {
  return `${track.instrument}:${track.sourceStem}:${track.provider}`;
}

export function buildPreviewTracks(tracks: TrackResult[]): PreviewTrack[] {
  return tracks.map((track) => ({
    key: getTrackKey(track),
    label: `${track.instrument} | ${track.sourceStem}`,
    instrument: track.instrument,
    sourceStem: track.sourceStem,
    provider: track.provider,
    eventCount: track.eventCount,
    notes: track.notes
  }));
}

export function getVisibleTracks(tracks: TrackResult[], visibleTrackKeys: readonly string[]): TrackResult[] {
  const visibleKeys = new Set(visibleTrackKeys);
  return tracks.filter((track) => visibleKeys.has(getTrackKey(track)));
}

export function getTrackEvents(tracks: TrackResult[]): NoteEvent[] {
  return tracks.flatMap((track) => track.notes).sort((left, right) => left.onsetSec - right.onsetSec);
}

export function getPreviewTimeBounds(notes: NoteEvent[]): PreviewTimeBounds {
  if (notes.length === 0) {
    return {
      startSec: 0,
      endSec: 4,
      durationSec: 4
    };
  }

  const startSec = Math.min(...notes.map((note) => note.onsetSec));
  const endSec = Math.max(...notes.map((note) => note.offsetSec ?? note.onsetSec + 0.12));

  return {
    startSec,
    endSec,
    durationSec: Math.max(0.5, endSec - startSec)
  };
}

export function getPianoPitchRange(notes: NoteEvent[]): { minPitch: number; maxPitch: number } {
  const pitches = notes.map((note) => note.pitch).filter((pitch): pitch is number => pitch != null);

  if (pitches.length === 0) {
    return { minPitch: 48, maxPitch: 84 };
  }

  return {
    minPitch: Math.max(21, Math.min(...pitches) - 2),
    maxPitch: Math.min(108, Math.max(...pitches) + 2)
  };
}

export function resolveBarBeat(note: Pick<NoteEvent, "bar" | "beat" | "onsetSec">, bpm: number): ResolvedBarBeat {
  if (note.bar != null && note.beat != null) {
    return {
      bar: note.bar,
      beat: note.beat
    };
  }

  return absoluteBeatToBarBeat(secondsToBeats(note.onsetSec, bpm));
}

export function groupNotesByBar(notes: NoteEvent[], bpm: number, maxBars = 8): PreviewMeasure[] {
  const grouped = new Map<number, NoteEvent[]>();

  for (const note of notes) {
    const { bar } = resolveBarBeat(note, bpm);
    const existing = grouped.get(bar) ?? [];
    existing.push(note);
    grouped.set(bar, existing);
  }

  return [...grouped.entries()]
    .sort((left, right) => left[0] - right[0])
    .slice(0, maxBars)
    .map(([bar, barNotes]) => ({
      bar,
      notes: barNotes.sort((left, right) => left.onsetSec - right.onsetSec)
    }));
}

export function getDrumLanes(notes: NoteEvent[]): DrumLane[] {
  const grouped = new Map<string, DrumLane>();

  for (const note of notes) {
    const midiNote = note.midiNote;
    const label = note.drumLabel ?? (midiNote != null ? `MIDI ${midiNote}` : "Drum");
    const key = `${label}:${midiNote ?? "na"}`;
    const existing = grouped.get(key) ?? {
      key,
      label,
      midiNote,
      notes: []
    };

    existing.notes.push(note);
    grouped.set(key, existing);
  }

  return [...grouped.values()].sort((left, right) => {
    if (left.midiNote != null && right.midiNote != null) {
      return right.midiNote - left.midiNote;
    }

    return left.label.localeCompare(right.label);
  });
}

export function midiToNoteName(pitch: number): string {
  const normalizedPitch = Math.max(0, Math.round(pitch));
  const noteName = NOTE_NAMES[normalizedPitch % 12];
  const octave = Math.floor(normalizedPitch / 12) - 1;
  return `${noteName}${octave}`;
}

export function getPianoStaffPlacement(pitch: number): StaffPlacement {
  const clef = pitch >= 60 ? "treble" : "bass";
  const referencePitch = clef === "treble" ? 64 : 43;
  const referenceStep = midiToDiatonicStep(referencePitch);
  const pitchStep = midiToDiatonicStep(pitch);

  return {
    clef,
    stepOffset: pitchStep - referenceStep
  };
}

function midiToDiatonicStep(pitch: number): number {
  const normalizedPitch = Math.max(0, Math.round(pitch));
  const pitchClass = normalizedPitch % 12;
  const octave = Math.floor(normalizedPitch / 12) - 1;
  return octave * 7 + NATURAL_NOTE_INDEX_BY_PITCH_CLASS[pitchClass];
}
