import type { InstrumentType, JobResult, NoteEvent, TrackResult } from "@ai-sheet-music-generator/shared-types";
import { absoluteBeatToBarBeat, beatsToSeconds, quantizeSeconds, secondsToBeats } from "./timing.js";
import { getTrackKey } from "./preview.js";

export const DEFAULT_DRUM_DURATION_BEATS = 0.25;
export const DEFAULT_DRUM_MIDI_NOTE = 38;
export const MIN_NOTE_DURATION_SEC = 0.05;

const DRUM_MIDI_BY_LABEL: Record<string, number> = {
  kick: 36,
  snare: 38,
  "hi-hat": 42,
  hihat: 42,
  tom: 45,
  ride: 51,
  crash: 49
};

export interface DraftSelection {
  draftNoteId: string;
  trackKey: string;
}

export interface SelectedDraftNote {
  selection: DraftSelection;
  track: TrackResult;
  note: NoteEvent;
}

export interface AddDraftNoteInput {
  trackKey: string;
  instrument: InstrumentType;
  sourceStem: string;
  onsetSec: number;
  durationSec: number;
  pitch?: number;
  drumLabel?: string;
  midiNote?: number;
  velocity?: number;
}

export interface AddDraftNoteResult {
  draftResult: JobResult;
  draftNoteId: string;
}

export function cloneJobResult(result: JobResult): JobResult {
  return {
    ...result,
    stems: result.stems.map((stem) => ({ ...stem })),
    tracks: result.tracks.map((track) => {
      const trackKey = getTrackKey(track);
      return {
        ...track,
        notes: track.notes.map((note) => ({
          ...note,
          draftNoteId: buildDraftNoteId(trackKey, note.id)
        }))
      };
    }),
    warnings: [...result.warnings]
  };
}

export function normalizeEditedResult(result: JobResult): JobResult {
  return {
    ...result,
    tracks: result.tracks.map((track) => normalizeTrackResult(track, result.bpm))
  };
}

export function normalizeJobResult(result: JobResult): JobResult {
  return normalizeEditedResult(result);
}

export function normalizeTrackResult(track: TrackResult, bpm: number): TrackResult {
  const trackKey = getTrackKey(track);
  const notes = track.notes
    .map((note) => normalizeNoteEvent(note, bpm, trackKey))
    .sort(
      (left, right) =>
        left.onsetSec - right.onsetSec ||
        compareOptionalNumber(left.pitch, right.pitch) ||
        left.draftNoteId!.localeCompare(right.draftNoteId!)
    );

  return {
    ...track,
    eventCount: notes.length,
    notes
  };
}

export function normalizeNoteEvent(note: NoteEvent, bpm: number, trackKey?: string): NoteEvent {
  const onsetSec = Math.max(0, quantizeSeconds(note.onsetSec, bpm));
  const durationSec = Math.max(MIN_NOTE_DURATION_SEC, getNoteDurationSec(note, bpm));
  const offsetSec = Number(quantizeSeconds(onsetSec + durationSec, bpm).toFixed(3));
  const { bar, beat } = absoluteBeatToBarBeat(secondsToBeats(onsetSec, bpm));
  const safeTrackKey = trackKey ?? note.sourceStem ?? note.instrument;

  return {
    ...note,
    draftNoteId: note.draftNoteId ?? buildDraftNoteId(safeTrackKey, note.id),
    pitch: note.instrument === "piano" && note.pitch != null ? clamp(Math.round(note.pitch), 0, 127) : undefined,
    midiNote:
      note.instrument === "drums"
        ? resolveDrumMidiNote(note.drumLabel, note.midiNote)
        : note.midiNote != null
          ? clamp(Math.round(note.midiNote), 0, 127)
          : undefined,
    onsetSec,
    offsetSec,
    velocity: note.velocity != null ? clamp(Math.round(note.velocity), 1, 127) : note.velocity,
    confidence: note.confidence != null ? Number(note.confidence.toFixed(3)) : note.confidence,
    bar,
    beat
  };
}

export function getNoteDurationSec(note: Pick<NoteEvent, "instrument" | "onsetSec" | "offsetSec">, bpm: number): number {
  if (note.offsetSec != null && note.offsetSec > note.onsetSec) {
    return Number(Math.max(MIN_NOTE_DURATION_SEC, note.offsetSec - note.onsetSec).toFixed(3));
  }

  return Number(Math.max(MIN_NOTE_DURATION_SEC, beatsToSeconds(DEFAULT_DRUM_DURATION_BEATS, bpm)).toFixed(3));
}

export function selectNote(result: JobResult, draftNoteId: string): SelectedDraftNote | null {
  for (const track of result.tracks) {
    const note = track.notes.find((candidate) => candidate.draftNoteId === draftNoteId);
    if (note) {
      return {
        selection: {
          draftNoteId,
          trackKey: getTrackKey(track)
        },
        track,
        note
      };
    }
  }

  return null;
}

export function updateNoteTiming(result: JobResult, draftNoteId: string, onsetSec: number): JobResult {
  const selected = selectNote(result, draftNoteId);
  if (!selected) {
    return result;
  }

  const durationSec = getNoteDurationSec(selected.note, result.bpm);
  return updateDraftNote(result, draftNoteId, (note) => ({
    ...note,
    onsetSec,
    offsetSec: onsetSec + durationSec
  }));
}

export function updateNoteDuration(result: JobResult, draftNoteId: string, durationSec: number): JobResult {
  return updateDraftNote(result, draftNoteId, (note) => ({
    ...note,
    offsetSec: note.onsetSec + Math.max(MIN_NOTE_DURATION_SEC, durationSec)
  }));
}

export function updateNotePitch(result: JobResult, draftNoteId: string, pitch: number): JobResult {
  return updateDraftNote(result, draftNoteId, (note) => ({
    ...note,
    pitch
  }));
}

export function deleteNote(result: JobResult, draftNoteId: string): JobResult {
  return normalizeEditedResult({
    ...result,
    tracks: result.tracks.map((track) => ({
      ...track,
      notes: track.notes.filter((note) => note.draftNoteId !== draftNoteId)
    }))
  });
}

export function addNote(result: JobResult, input: AddDraftNoteInput): AddDraftNoteResult {
  const draftNoteId = generateDraftNoteId();
  const nextNote: NoteEvent = {
    id: draftNoteId,
    draftNoteId,
    instrument: input.instrument,
    pitch: input.instrument === "piano" ? input.pitch ?? 60 : undefined,
    drumLabel: input.instrument === "drums" ? normalizeDrumLabel(input.drumLabel) : undefined,
    midiNote: input.instrument === "drums" ? resolveDrumMidiNote(input.drumLabel, input.midiNote) : undefined,
    onsetSec: input.onsetSec,
    offsetSec: input.onsetSec + Math.max(MIN_NOTE_DURATION_SEC, input.durationSec),
    velocity: input.velocity ?? (input.instrument === "drums" ? 96 : 88),
    confidence: 1,
    sourceStem: input.sourceStem
  };

  const draftResult = normalizeEditedResult({
    ...result,
    tracks: result.tracks.map((track) =>
      getTrackKey(track) === input.trackKey
        ? {
            ...track,
            notes: [...track.notes, nextNote]
          }
        : track
    )
  });

  return { draftResult, draftNoteId };
}

export function resetDraftFromOriginal(originalResult: JobResult): JobResult {
  return normalizeEditedResult(cloneJobResult(originalResult));
}

export function resolveDrumMidiNote(drumLabel?: string, midiNote?: number): number {
  if (midiNote != null) {
    return clamp(Math.round(midiNote), 35, 81);
  }

  const normalizedLabel = normalizeDrumLabel(drumLabel);
  if (normalizedLabel && normalizedLabel in DRUM_MIDI_BY_LABEL) {
    return DRUM_MIDI_BY_LABEL[normalizedLabel];
  }

  return DEFAULT_DRUM_MIDI_NOTE;
}

export function normalizeDrumLabel(drumLabel?: string): string {
  const normalized = drumLabel?.trim().toLowerCase();
  return normalized && normalized.length > 0 ? normalized : "snare";
}

export function buildDraftNoteId(trackKey: string, noteId: string): string {
  return `draft:${trackKey}:${noteId}`;
}

export function generateDraftNoteId(): string {
  if (typeof globalThis !== "undefined" && globalThis.crypto && "randomUUID" in globalThis.crypto) {
    return `draft:user:${globalThis.crypto.randomUUID()}`;
  }

  return `draft:user:${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function updateDraftNote(result: JobResult, draftNoteId: string, updater: (note: NoteEvent) => NoteEvent): JobResult {
  return normalizeEditedResult({
    ...result,
    tracks: result.tracks.map((track) => ({
      ...track,
      notes: track.notes.map((note) => (note.draftNoteId === draftNoteId ? updater(note) : note))
    }))
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function compareOptionalNumber(left?: number, right?: number): number {
  if (left == null && right == null) {
    return 0;
  }

  if (left == null) {
    return 1;
  }

  if (right == null) {
    return -1;
  }

  return left - right;
}
