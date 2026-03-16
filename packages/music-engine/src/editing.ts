import type { CorrectionSuggestedChange, InstrumentType, JobResult, NoteEvent, TrackResult } from "@ai-sheet-music-generator/shared-types";
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

export interface QuantizeDraftNotesInput {
  draftNoteIds?: string[];
  subdivision: number;
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

export interface ReplaceInstrumentRegionNotesInput {
  instrument: InstrumentType;
  startSec: number;
  endSec: number;
  notes: NoteEvent[];
}

export interface ReplaceInstrumentRegionNotesResult {
  draftResult: JobResult;
  insertedDraftNoteIds: string[];
}

export interface ApplyCorrectionSuggestionInput {
  draftNoteId: string;
  suggestedChange: CorrectionSuggestedChange;
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
          draftNoteId: note.draftNoteId ?? buildDraftNoteId(trackKey, note.id)
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

export function selectNotes(result: JobResult, draftNoteIds: string[]): SelectedDraftNote[] {
  const requestedIds = new Set(draftNoteIds);
  const selectedNotes: SelectedDraftNote[] = [];

  for (const track of result.tracks) {
    const trackKey = getTrackKey(track);
    for (const note of track.notes) {
      if (note.draftNoteId && requestedIds.has(note.draftNoteId)) {
        selectedNotes.push({
          selection: {
            draftNoteId: note.draftNoteId,
            trackKey
          },
          track,
          note
        });
      }
    }
  }

  return selectedNotes.sort(
    (left, right) =>
      left.note.onsetSec - right.note.onsetSec ||
      compareOptionalNumber(left.note.pitch, right.note.pitch) ||
      left.selection.draftNoteId.localeCompare(right.selection.draftNoteId)
  );
}

export function sanitizeDraftNoteIds(result: JobResult, draftNoteIds: string[]): string[] {
  const availableIds = new Set(
    result.tracks.flatMap((track) => track.notes.map((note) => note.draftNoteId).filter((draftNoteId): draftNoteId is string => Boolean(draftNoteId)))
  );

  return draftNoteIds.filter((draftNoteId, index) => availableIds.has(draftNoteId) && draftNoteIds.indexOf(draftNoteId) === index);
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

export function moveNotesByDelta(result: JobResult, draftNoteIds: string[], deltaSec: number): JobResult {
  const selectedNotes = selectNotes(result, draftNoteIds);
  if (selectedNotes.length === 0) {
    return result;
  }

  const earliestOnsetSec = Math.min(...selectedNotes.map((selected) => selected.note.onsetSec));
  const safeDeltaSec = Math.max(deltaSec, -earliestOnsetSec);
  const selectedIds = new Set(selectedNotes.map((selected) => selected.selection.draftNoteId));

  return normalizeEditedResult({
    ...result,
    tracks: result.tracks.map((track) => ({
      ...track,
      notes: track.notes.map((note) => {
        if (!note.draftNoteId || !selectedIds.has(note.draftNoteId)) {
          return note;
        }

        return {
          ...note,
          onsetSec: note.onsetSec + safeDeltaSec,
          offsetSec: (note.offsetSec ?? note.onsetSec) + safeDeltaSec
        };
      })
    }))
  });
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

export function updateNoteVelocity(result: JobResult, draftNoteId: string, velocity: number): JobResult {
  return updateDraftNote(result, draftNoteId, (note) => ({
    ...note,
    velocity
  }));
}

export function applyCorrectionSuggestion(result: JobResult, input: ApplyCorrectionSuggestionInput): JobResult {
  const selected = selectNote(result, input.draftNoteId);
  if (!selected) {
    return result;
  }

  return updateDraftNote(result, input.draftNoteId, (note) => {
    const nextOnsetSec = input.suggestedChange.onsetSec ?? note.onsetSec;
    const currentDurationSec = getNoteDurationSec(note, result.bpm);
    const nextOffsetSec =
      input.suggestedChange.offsetSec ??
      (input.suggestedChange.onsetSec != null && note.offsetSec != null ? nextOnsetSec + currentDurationSec : note.offsetSec);

    return {
      ...note,
      onsetSec: nextOnsetSec,
      offsetSec: nextOffsetSec,
      pitch:
        note.instrument === "piano" && input.suggestedChange.pitch != null ? input.suggestedChange.pitch : note.pitch,
      velocity: input.suggestedChange.velocity ?? note.velocity,
      drumLabel:
        note.instrument === "drums" && input.suggestedChange.drumLabel != null
          ? normalizeDrumLabel(input.suggestedChange.drumLabel)
          : note.drumLabel,
      midiNote:
        note.instrument === "drums"
          ? input.suggestedChange.midiNote ??
            (input.suggestedChange.drumLabel != null ? resolveDrumMidiNote(input.suggestedChange.drumLabel) : note.midiNote)
          : note.midiNote
    };
  });
}

export function deleteNote(result: JobResult, draftNoteId: string): JobResult {
  return deleteNotes(result, [draftNoteId]);
}

export function deleteNotes(result: JobResult, draftNoteIds: string[]): JobResult {
  const selectedIds = new Set(draftNoteIds);
  return normalizeEditedResult({
    ...result,
    tracks: result.tracks.map((track) => ({
      ...track,
      notes: track.notes.filter((note) => !note.draftNoteId || !selectedIds.has(note.draftNoteId))
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

export function replaceInstrumentRegionNotes(
  result: JobResult,
  input: ReplaceInstrumentRegionNotesInput
): ReplaceInstrumentRegionNotesResult {
  const insertedDraftNoteIds: string[] = [];

  const nextTracks = result.tracks.map((track) => {
    if (track.instrument !== input.instrument) {
      return track;
    }

    const retainedNotes = track.notes.filter((note) => !noteOverlapsRegion(note, input.startSec, input.endSec, result.bpm));
    const replacementNotes = input.notes
      .filter((note) => note.instrument === track.instrument && note.sourceStem === track.sourceStem)
      .map((note) => {
        const draftNoteId = generateDraftNoteId();
        insertedDraftNoteIds.push(draftNoteId);
        return {
          ...note,
          draftNoteId
        };
      });

    return {
      ...track,
      notes: [...retainedNotes, ...replacementNotes]
    };
  });

  const draftResult = normalizeEditedResult({
    ...result,
    tracks: nextTracks
  });

  return {
    draftResult,
    insertedDraftNoteIds: sanitizeDraftNoteIds(draftResult, insertedDraftNoteIds)
  };
}

export function resetDraftFromOriginal(originalResult: JobResult): JobResult {
  return normalizeEditedResult(cloneJobResult(originalResult));
}

export function areJobResultsEqual(left: JobResult | null | undefined, right: JobResult | null | undefined): boolean {
  if (!left || !right) {
    return left === right;
  }

  return JSON.stringify(normalizeEditedResult(left)) === JSON.stringify(normalizeEditedResult(right));
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

export function quantizeDraftNotes(result: JobResult, input: QuantizeDraftNotesInput): JobResult {
  const selectedIds = input.draftNoteIds ? new Set(input.draftNoteIds) : null;

  return normalizeEditedResult({
    ...result,
    tracks: result.tracks.map((track) => ({
      ...track,
      notes: track.notes.map((note) => {
        if (selectedIds && (!note.draftNoteId || !selectedIds.has(note.draftNoteId))) {
          return note;
        }

        const onsetBeat = secondsToBeats(note.onsetSec, result.bpm);
        const durationBeat = secondsToBeats(getNoteDurationSec(note, result.bpm), result.bpm);
        const quantizedOnsetSec = beatsToSeconds(roundToSubdivision(onsetBeat, input.subdivision), result.bpm);
        const quantizedOffsetSec = beatsToSeconds(
          roundToSubdivision(onsetBeat + durationBeat, input.subdivision),
          result.bpm
        );

        return {
          ...note,
          onsetSec: Number(Math.max(0, quantizedOnsetSec).toFixed(3)),
          offsetSec: Number(Math.max(quantizedOnsetSec + MIN_NOTE_DURATION_SEC, quantizedOffsetSec).toFixed(3))
        };
      })
    }))
  });
}

export function reassignDrumLane(
  result: JobResult,
  draftNoteIds: string[],
  drumLabel: string,
  midiNote?: number
): JobResult {
  const selectedIds = new Set(draftNoteIds);
  const normalizedDrumLabel = normalizeDrumLabel(drumLabel);
  const resolvedMidiNote = resolveDrumMidiNote(normalizedDrumLabel, midiNote);

  return normalizeEditedResult({
    ...result,
    tracks: result.tracks.map((track) => ({
      ...track,
      notes: track.notes.map((note) => {
        if (note.instrument !== "drums" || !note.draftNoteId || !selectedIds.has(note.draftNoteId)) {
          return note;
        }

        return {
          ...note,
          drumLabel: normalizedDrumLabel,
          midiNote: resolvedMidiNote
        };
      })
    }))
  });
}

export function transposeNotes(result: JobResult, draftNoteIds: string[], semitones: number): JobResult {
  const selectedIds = new Set(draftNoteIds);

  return normalizeEditedResult({
    ...result,
    tracks: result.tracks.map((track) => ({
      ...track,
      notes: track.notes.map((note) => {
        if (note.instrument !== "piano" || note.pitch == null || !note.draftNoteId || !selectedIds.has(note.draftNoteId)) {
          return note;
        }

        return {
          ...note,
          pitch: note.pitch + semitones
        };
      })
    }))
  });
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

function noteOverlapsRegion(note: NoteEvent, startSec: number, endSec: number, _bpm: number): boolean {
  const noteEndSec = note.offsetSec ?? note.onsetSec;
  return note.onsetSec < endSec && noteEndSec > startSec;
}

function roundToSubdivision(beatPosition: number, subdivision: number): number {
  const safeSubdivision = Math.max(1, subdivision);
  return Math.round(beatPosition * safeSubdivision) / safeSubdivision;
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
