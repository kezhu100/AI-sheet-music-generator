"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  selectedNoteIds?: string[];
  onSelectNote?: (trackKey: string, noteId: string, options?: { additive?: boolean }) => void;
  onBoxSelect?: (noteIds: string[], options?: { additive?: boolean }) => void;
  onClearSelection?: () => void;
  onMoveNote?: (trackKey: string, noteId: string, onsetSec: number) => void;
}

interface NoteDragState {
  mode: "note";
  trackKey: string;
  draftNoteId: string;
  startClientX: number;
  originalOnsetSec: number;
}

interface BoxSelectionState {
  mode: "box";
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  additive: boolean;
}

interface PreviewNote extends NoteEvent {
  trackKey: string;
  offsetSec: number;
}

interface NoteLayout extends PreviewNote {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function PianoRollPreview({
  tracks,
  bpm,
  selectedTrackKey,
  selectedNoteId,
  selectedNoteIds = [],
  onSelectNote,
  onBoxSelect,
  onClearSelection,
  onMoveNote
}: PianoRollPreviewProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [interactionState, setInteractionState] = useState<NoteDragState | BoxSelectionState | null>(null);

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
  const selectedIds = useMemo(() => new Set(selectedNoteIds), [selectedNoteIds]);
  const pianoLayouts = useMemo(
    () =>
      pianoNotes.map((note) => {
        const pitch = note.pitch ?? pitchRange.minPitch;
        const x = labelWidth + ((note.onsetSec - timeBounds.startSec) / durationSec) * gridWidth;
        const width = Math.max(8, ((note.offsetSec - note.onsetSec) / durationSec) * gridWidth);
        const rowIndex = pitchRange.maxPitch - pitch;
        const y = rowIndex * rowHeight + 2;

        return {
          ...note,
          x,
          y,
          width,
          height: rowHeight - 4
        };
      }),
    [durationSec, gridWidth, labelWidth, pianoNotes, pitchRange.maxPitch, pitchRange.minPitch, rowHeight, timeBounds.startSec]
  );
  const drumLayouts = useMemo(
    () =>
      drumLanes.flatMap((lane, laneIndex) => {
        const laneTop = pianoHeight + laneIndex * rowHeight;
        return lane.notes.map((laneNote) => {
          const note = laneNote as PreviewNote;
          const x = labelWidth + ((note.onsetSec - timeBounds.startSec) / durationSec) * gridWidth;

          return {
            ...note,
            x: x - 4,
            y: laneTop + 3,
            width: 8,
            height: rowHeight - 6
          };
        });
      }),
    [drumLanes, durationSec, gridWidth, labelWidth, pianoHeight, rowHeight, timeBounds.startSec]
  );
  const noteLayouts = [...pianoLayouts, ...drumLayouts];

  useEffect(() => {
    if (!interactionState) {
      return;
    }

    const activeInteraction = interactionState;

    function handlePointerMove(event: PointerEvent): void {
      if (activeInteraction.mode === "note" && onMoveNote) {
        const deltaX = event.clientX - activeInteraction.startClientX;
        const deltaSec = (deltaX / gridWidth) * durationSec;
        onMoveNote(
          activeInteraction.trackKey,
          activeInteraction.draftNoteId,
          Math.max(0, activeInteraction.originalOnsetSec + deltaSec)
        );
        return;
      }

      if (activeInteraction.mode === "box") {
        const nextPoint = clientPointToSvgPoint(svgRef.current, event.clientX, event.clientY);
        if (!nextPoint) {
          return;
        }

        setInteractionState((current) =>
          current?.mode === "box"
            ? {
                ...current,
                currentX: nextPoint.x,
                currentY: nextPoint.y
              }
            : current
        );
      }
    }

    function handlePointerUp(): void {
      if (activeInteraction.mode === "box") {
        const selectionBounds = toSelectionBounds(activeInteraction);
        const intersectingNoteIds = noteLayouts
          .filter((layout) => intersects(selectionBounds, layout))
          .map((layout) => layout.draftNoteId)
          .filter((draftNoteId): draftNoteId is string => Boolean(draftNoteId));

        if (intersectingNoteIds.length > 0) {
          onBoxSelect?.(intersectingNoteIds, { additive: activeInteraction.additive });
        } else if (!activeInteraction.additive) {
          onClearSelection?.();
        }
      }

      setInteractionState(null);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [durationSec, gridWidth, interactionState, noteLayouts, onBoxSelect, onClearSelection, onMoveNote]);

  return (
    <div className="preview-scroll">
      <svg
        aria-label="Piano roll preview"
        className="preview-svg"
        ref={svgRef}
        role="img"
        viewBox={`0 0 ${width} ${height}`}
      >
        <rect fill="rgba(255,255,255,0.82)" height={height} rx="18" width={width} x="0" y="0" />
        <rect
          fill="transparent"
          height={height}
          width={width}
          x="0"
          y="0"
          onPointerDown={(event) => {
            if (!onBoxSelect) {
              if (!(event.metaKey || event.ctrlKey)) {
                onClearSelection?.();
              }
              return;
            }

            const startPoint = clientPointToSvgPoint(svgRef.current, event.clientX, event.clientY);
            if (!startPoint) {
              return;
            }

            setInteractionState({
              mode: "box",
              startX: startPoint.x,
              startY: startPoint.y,
              currentX: startPoint.x,
              currentY: startPoint.y,
              additive: event.metaKey || event.ctrlKey || event.shiftKey
            });
          }}
        />

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

        {pianoLayouts.map((note) => {
          const isSelected =
            (selectedTrackKey === note.trackKey && selectedNoteId === note.draftNoteId) ||
            (note.draftNoteId ? selectedIds.has(note.draftNoteId) : false);
          return (
            <rect
              className={`piano-roll-note piano ${isSelected ? "is-selected" : ""}`}
              height={note.height}
              key={note.draftNoteId ?? `${note.trackKey}-${note.id}`}
              onPointerDown={(event) => {
                if (!note.draftNoteId) {
                  return;
                }

                event.stopPropagation();
                const additive = event.metaKey || event.ctrlKey || event.shiftKey;
                onSelectNote?.(note.trackKey, note.draftNoteId, { additive });
                if (onMoveNote) {
                  setInteractionState({
                    mode: "note",
                    trackKey: note.trackKey,
                    draftNoteId: note.draftNoteId,
                    startClientX: event.clientX,
                    originalOnsetSec: note.onsetSec
                  });
                }
              }}
              rx="5"
              style={{ cursor: onMoveNote ? "grab" : "pointer" }}
              width={note.width}
              x={note.x}
              y={note.y}
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

              {drumLayouts.filter((note) => note.y >= laneTop && note.y < laneTop + rowHeight).map((note) => {
                const isSelected =
                  (selectedTrackKey === note.trackKey && selectedNoteId === note.draftNoteId) ||
                  (note.draftNoteId ? selectedIds.has(note.draftNoteId) : false);

                return (
                  <rect
                    className={`piano-roll-note drums ${isSelected ? "is-selected" : ""}`}
                    height={rowHeight - 6}
                    key={note.draftNoteId ?? `${note.trackKey}-${note.id}`}
                    onPointerDown={(event) => {
                      if (!note.draftNoteId) {
                        return;
                      }

                      event.stopPropagation();
                      const additive = event.metaKey || event.ctrlKey || event.shiftKey;
                      onSelectNote?.(note.trackKey, note.draftNoteId, { additive });
                      if (onMoveNote) {
                        setInteractionState({
                          mode: "note",
                          trackKey: note.trackKey,
                          draftNoteId: note.draftNoteId,
                          startClientX: event.clientX,
                          originalOnsetSec: note.onsetSec
                        });
                      }
                    }}
                    rx="4"
                    style={{ cursor: onMoveNote ? "grab" : "pointer" }}
                    width={note.width}
                    x={note.x}
                    y={note.y}
                  />
                );
              })}
            </g>
          );
        })}

        {interactionState?.mode === "box" ? (
          <rect
            className="selection-box"
            height={Math.abs(interactionState.currentY - interactionState.startY)}
            width={Math.abs(interactionState.currentX - interactionState.startX)}
            x={Math.min(interactionState.startX, interactionState.currentX)}
            y={Math.min(interactionState.startY, interactionState.currentY)}
          />
        ) : null}
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

function clientPointToSvgPoint(
  svgElement: SVGSVGElement | null,
  clientX: number,
  clientY: number
): { x: number; y: number } | null {
  if (!svgElement) {
    return null;
  }

  const bounds = svgElement.getBoundingClientRect();
  if (bounds.width === 0 || bounds.height === 0) {
    return null;
  }

  const viewBox = svgElement.viewBox.baseVal;
  const x = ((clientX - bounds.left) / bounds.width) * viewBox.width;
  const y = ((clientY - bounds.top) / bounds.height) * viewBox.height;

  return {
    x: Math.max(0, Math.min(viewBox.width, x)),
    y: Math.max(0, Math.min(viewBox.height, y))
  };
}

function toSelectionBounds(selection: BoxSelectionState): { x: number; y: number; width: number; height: number } {
  return {
    x: Math.min(selection.startX, selection.currentX),
    y: Math.min(selection.startY, selection.currentY),
    width: Math.abs(selection.currentX - selection.startX),
    height: Math.abs(selection.currentY - selection.startY)
  };
}

function intersects(
  bounds: { x: number; y: number; width: number; height: number },
  noteLayout: { x: number; y: number; width: number; height: number }
): boolean {
  return (
    noteLayout.x < bounds.x + bounds.width &&
    noteLayout.x + noteLayout.width > bounds.x &&
    noteLayout.y < bounds.y + bounds.height &&
    noteLayout.y + noteLayout.height > bounds.y
  );
}
