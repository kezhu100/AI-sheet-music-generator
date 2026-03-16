import type { InstrumentType, JobResult, NoteEvent, TrackResult } from "@ai-sheet-music-generator/shared-types";
export {
  DEFAULT_BEATS_PER_BAR,
  DEFAULT_QUANTIZATION_SUBDIVISION,
  absoluteBeatToBarBeat,
  beatsToSeconds,
  bpmToBeatDuration,
  formatBeatPosition,
  formatEventTiming,
  quantizeBeat,
  quantizeSeconds,
  secondsToBeats
} from "./timing";
export {
  buildPreviewTracks,
  getDrumLanes,
  getPianoPitchRange,
  getPianoStaffPlacement,
  getPreviewTimeBounds,
  getTrackEvents,
  getTrackKey,
  getVisibleTracks,
  groupNotesByBar,
  midiToNoteName,
  resolveBarBeat
} from "./preview";
export type { DrumLane, PreviewMeasure, PreviewTimeBounds, PreviewTrack, ResolvedBarBeat, StaffPlacement } from "./preview";

export interface TrackSummary {
  instrument: InstrumentType;
  sourceStem: string;
  provider: string;
  eventCount: number;
  avgConfidence: number;
}

export function summarizeTrack(track: TrackResult): TrackSummary {
  const avgConfidence =
    track.notes.length === 0
      ? 0
      : track.notes.reduce((sum, note) => sum + (note.confidence ?? 0), 0) / track.notes.length;

  return {
    instrument: track.instrument,
    sourceStem: track.sourceStem,
    provider: track.provider,
    eventCount: track.eventCount,
    avgConfidence: Number(avgConfidence.toFixed(2))
  };
}

export function summarizeJobResult(result: JobResult): TrackSummary[] {
  return result.tracks.map(summarizeTrack);
}

export function sortEventsByTime(events: NoteEvent[]): NoteEvent[] {
  return [...events].sort((left, right) => left.onsetSec - right.onsetSec);
}
