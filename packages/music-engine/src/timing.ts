import type { NoteEvent } from "@ai-sheet-music-generator/shared-types";

export const DEFAULT_BEATS_PER_BAR = 4;
export const DEFAULT_QUANTIZATION_SUBDIVISION = 4;

export function bpmToBeatDuration(bpm: number): number {
  if (bpm <= 0) {
    return 0;
  }

  return 60 / bpm;
}

export function secondsToBeats(seconds: number, bpm: number): number {
  const beatDuration = bpmToBeatDuration(bpm);
  if (beatDuration <= 0) {
    return 0;
  }

  return seconds / beatDuration;
}

export function beatsToSeconds(beats: number, bpm: number): number {
  return beats * bpmToBeatDuration(bpm);
}

export function quantizeBeat(beatPosition: number, subdivision = DEFAULT_QUANTIZATION_SUBDIVISION): number {
  if (subdivision <= 0) {
    return Number(beatPosition.toFixed(6));
  }

  return Number((Math.round(beatPosition * subdivision) / subdivision).toFixed(6));
}

export function quantizeSeconds(seconds: number, bpm: number, subdivision = DEFAULT_QUANTIZATION_SUBDIVISION): number {
  return Number(beatsToSeconds(quantizeBeat(secondsToBeats(seconds, bpm), subdivision), bpm).toFixed(3));
}

export function absoluteBeatToBarBeat(
  absoluteBeat: number,
  beatsPerBar = DEFAULT_BEATS_PER_BAR
): { bar: number; beat: number } {
  const safeBeatsPerBar = Math.max(1, beatsPerBar);
  const beatIndex = Math.floor(absoluteBeat);

  return {
    bar: Math.floor(beatIndex / safeBeatsPerBar) + 1,
    beat: Number(((absoluteBeat % safeBeatsPerBar) + 1).toFixed(2))
  };
}

export function formatBeatPosition(note: Pick<NoteEvent, "bar" | "beat">): string {
  if (note.bar == null || note.beat == null) {
    return "bar n/a beat n/a";
  }

  return `bar ${note.bar} beat ${note.beat}`;
}

export function formatEventTiming(note: Pick<NoteEvent, "onsetSec" | "offsetSec" | "bar" | "beat">): string {
  const end = note.offsetSec ?? note.onsetSec;
  return `${note.onsetSec.toFixed(2)}s to ${end.toFixed(2)}s | ${formatBeatPosition(note)}`;
}
