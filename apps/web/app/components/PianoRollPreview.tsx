"use client";

import { getDrumLanes, getPianoPitchRange, getPreviewTimeBounds, midiToNoteName } from "@ai-sheet-music-generator/music-engine";
import type { TrackResult } from "@ai-sheet-music-generator/shared-types";

interface PianoRollPreviewProps {
  tracks: TrackResult[];
}

export function PianoRollPreview({ tracks }: PianoRollPreviewProps) {
  const pianoNotes = tracks
    .filter((track) => track.instrument === "piano")
    .flatMap((track) => track.notes)
    .filter((note) => note.pitch != null);
  const drumNotes = tracks.filter((track) => track.instrument === "drums").flatMap((track) => track.notes);
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
          const noteWidth = Math.max(
            8,
            (((note.offsetSec ?? note.onsetSec + 0.12) - note.onsetSec) / durationSec) * gridWidth
          );
          const rowIndex = pitchRange.maxPitch - pitch;
          const y = rowIndex * rowHeight + 2;

          return (
            <rect
              className="piano-roll-note piano"
              height={rowHeight - 4}
              key={note.id}
              rx="5"
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

              {lane.notes.map((note) => {
                const x = labelWidth + ((note.onsetSec - timeBounds.startSec) / durationSec) * gridWidth;

                return <rect className="piano-roll-note drums" height={rowHeight - 6} key={note.id} rx="4" width="8" x={x - 4} y={laneTop + 3} />;
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
