"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getDrumLanes,
  getNoteDurationSec,
  getPianoPitchRange,
  getPreviewTimeBounds,
  getTrackKey,
  midiToNoteName
} from "@ai-sheet-music-generator/music-engine";
import type { NoteEvent, TrackResult } from "@ai-sheet-music-generator/shared-types";

interface PianoRollPreviewProps {
  tracks: TrackResult[];
  bpm: number;
  selectedTrackKey?: string | null;
  selectedNoteId?: string | null;
  onSelectNote?: (trackKey: string, noteId: string) => void;
  onMoveNote?: (trackKey: string, noteId: string, onsetSec: number) => void;
}

interface DragState {
  trackKey: string;
  draftNoteId: string;
  startClientX: number;
  originalOnsetSec: number;
}

interface PreviewNote extends NoteEvent {
  trackKey: string;
  offsetSec: number;
}

export function PianoRollPreview({
  tracks,
  bpm,
  selectedTrackKey,
  selectedNoteId,
  onSelectNote,
  onMoveNote
}: PianoRollPreviewProps) {
  const [dragState, setDragState] = useState<DragState | null>(null);

  const pianoNotes = useMemo(
    () =>
      tracks
        .filter((track) => track.instrument === "piano")
        .flatMap((track) =>
          track.notes
            .filter((note) => note.pitch != null)
            .map((note) => toPreviewNote(note, getTrackKey(track), bpm))
        ),
    [bpm, tracks]
  );
  const drumNotes = useMemo(
    () =>
      tracks.filter((track) => track.instrument === "drums").flatMap((track) =>
        track.notes.map((note) => toPreviewNote(note, getTrackKey(track), bpm))
      ),
    [bpm, tracks]
  );
  const allNotes = [...pianoNotes, ...drumNotes];

  if (allNotes.length === 0) {
    return <p className="muted">No visible note events are available for the piano-roll preview yet.</p>;
  }

  const timeBounds = getPreviewTimeBounds(allNotes);
  const pitchRange = getPianoPitchRange(pianoNotes);
  const drumLanes = getDrumLanes(drumNotes);
  const rowHeight = 18;
  const pianoRowCount = pianoNotes.length > 0 ? pitchRange.maxPitch - pitchRange.minPitch + 1 : 0;
  const drumRowCount = drumLanes.length;
  const width = 960;
  const labelWidth = 76;
  const gridWidth = width - labelWidth;
  const pianoHeight = Math.max(120, pianoRowCount * rowHeight);
  const drumHeight = drumRowCount > 0 ? drumRowCount * rowHeight + 24 : 0;
  const height = pianoHeight + drumHeight;
  const durationSec = Math.max(0.25, timeBounds.durationSec);

  useEffect(() => {
    if (!dragState || !onMoveNote) {
      return;
    }

    const activeDrag = dragState;
    const moveNote = onMoveNote;

    function handlePointerMove(event: PointerEvent): void {
      const deltaX = event.clientX - activeDrag.startClientX;
      const deltaSec = (deltaX / gridWidth) * durationSec;
      moveNote(activeDrag.trackKey, activeDrag.draftNoteId, Math.max(0, activeDrag.originalOnsetSec + deltaSec));
    }

    function handlePointerUp(): void {
      setDragState(null);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [dragState, durationSec, gridWidth, onMoveNote]);

  return (
    <div className="preview-scroll">
      <svg aria-label="Piano roll preview" className="preview-svg" role="img" viewBox={`0 0 ${width} ${height}`}>
        <rect fill="rgba(255,255,255,0.82)" height={height} rx="18" width={width} x="0" y="0" />

        {pianoNotes.length > 0
          ? Array.from({ length: pianoRowCount }, (_, index) => {
              const pitch = pitchRange.maxPitch - index;
              const y = index * rowHeight;

              return (
                <g key={`pitch-row-${pitch}`}>
                  <text className="preview-axis" x="10" y={y + 13}>
                    {midiToNoteName(pitch)}
                  </text>
                  <line className="preview-grid-line" x1={labelWidth} x2={width} y1={y + rowHeight} y2={y + rowHeight} />
                </g>
              );
            })
          : null}

        {Array.from({ length: 9 }, (_, index) => {
          const x = labelWidth + (gridWidth / 8) * index;
          return <line className="preview-grid-line strong" key={`time-grid-${index}`} x1={x} x2={x} y1="0" y2={height} />;
        })}

        {pianoNotes.map((note) => {
          const pitch = note.pitch ?? pitchRange.minPitch;
          const x = labelWidth + ((note.onsetSec - timeBounds.startSec) / durationSec) * gridWidth;
          const noteWidth = Math.max(8, ((note.offsetSec - note.onsetSec) / durationSec) * gridWidth);
          const rowIndex = pitchRange.maxPitch - pitch;
          const y = rowIndex * rowHeight + 2;
          const isSelected = selectedTrackKey === note.trackKey && selectedNoteId === note.draftNoteId;

          return (
            <rect
              className={`piano-roll-note piano ${isSelected ? "is-selected" : ""}`}
              height={rowHeight - 4}
              key={note.draftNoteId ?? `${note.trackKey}-${note.id}`}
              onPointerDown={(event) => {
                if (!note.draftNoteId) {
                  return;
                }

                onSelectNote?.(note.trackKey, note.draftNoteId);
                if (onMoveNote) {
                  setDragState({
                    trackKey: note.trackKey,
                    draftNoteId: note.draftNoteId,
                    startClientX: event.clientX,
                    originalOnsetSec: note.onsetSec
                  });
                }
              }}
              rx="5"
              style={{ cursor: onMoveNote ? "grab" : "pointer" }}
              width={noteWidth}
              x={x}
              y={y}
            />
          );
        })}

        {drumLanes.map((lane, laneIndex) => {
          const laneTop = pianoHeight + laneIndex * rowHeight;

          return (
            <g key={lane.key}>
              <text className="preview-axis" x="10" y={laneTop + 13}>
                {lane.label}
              </text>
              <line className="preview-grid-line" x1={labelWidth} x2={width} y1={laneTop + rowHeight} y2={laneTop + rowHeight} />

              {lane.notes.map((laneNote) => {
                const note = laneNote as PreviewNote;
                const x = labelWidth + ((note.onsetSec - timeBounds.startSec) / durationSec) * gridWidth;
                const isSelected = selectedTrackKey === note.trackKey && selectedNoteId === note.draftNoteId;

                return (
                  <rect
                    className={`piano-roll-note drums ${isSelected ? "is-selected" : ""}`}
                    height={rowHeight - 6}
                    key={note.draftNoteId ?? `${note.trackKey}-${note.id}`}
                    onPointerDown={(event) => {
                      if (!note.draftNoteId) {
                        return;
                      }

                      onSelectNote?.(note.trackKey, note.draftNoteId);
                      if (onMoveNote) {
                        setDragState({
                          trackKey: note.trackKey,
                          draftNoteId: note.draftNoteId,
                          startClientX: event.clientX,
                          originalOnsetSec: note.onsetSec
                        });
                      }
                    }}
                    rx="4"
                    style={{ cursor: onMoveNote ? "grab" : "pointer" }}
                    width="8"
                    x={x - 4}
                    y={laneTop + 3}
                  />
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function toPreviewNote(note: NoteEvent, trackKey: string, bpm: number): PreviewNote {
  return {
    ...note,
    trackKey,
    offsetSec: note.offsetSec ?? note.onsetSec + getNoteDurationSec(note, bpm)
  };
}
