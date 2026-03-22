"use client";

import { getDrumLanes, groupNotesByBar, resolveBarBeat } from "@ai-sheet-music-generator/music-engine";
import type { TrackResult } from "@ai-sheet-music-generator/shared-types";

interface DrumNotationPreviewProps {
  track: TrackResult | null;
  bpm: number;
}

export function DrumNotationPreview({ track, bpm }: DrumNotationPreviewProps) {
  if (!track) {
    return <p className="muted">A visible drum track is required before the preview can render. / 需要先显示鼓组音轨，才能渲染预览。</p>;
  }

  if (track.notes.length === 0) {
    return <p className="muted">No drum hits are available in the current visible tracks. / 当前可见音轨中没有可用于鼓组预览的打击事件。</p>;
  }

  const measures = groupNotesByBar(track.notes, bpm, 8);
  const lanes = getDrumLanes(track.notes);
  const width = 960;
  const labelWidth = 88;
  const measureWidth = 100;
  const rowHeight = 34;
  const height = lanes.length * rowHeight + 36;

  return (
    <div className="result-window result-window-drum">
      <div className="result-window-toolbar muted">
        <span>Drum Preview / 鼓组预览</span>
        <span>Scroll inside the window to inspect drum lanes and bar details. / 可在窗口内滚动，查看鼓组轨道与小节细节。</span>
      </div>
      <div className="preview-scroll result-window-viewport result-window-viewport-drum">
        <svg aria-label="Drum notation preview" className="preview-svg" role="img" viewBox={`0 0 ${width} ${height}`}>
          <rect fill="rgba(255,255,255,0.82)" height={height} rx="18" width={width} x="0" y="0" />

          {lanes.map((lane, index) => {
            const y = 26 + index * rowHeight;

            return (
              <g key={lane.key}>
                <text className="preview-axis" x="12" y={y + 10}>
                  {lane.label}
                </text>
                <line className="preview-grid-line" x1={labelWidth} x2={labelWidth + measureWidth * measures.length} y1={y + 16} y2={y + 16} />
              </g>
            );
          })}

          {measures.map((measure, measureIndex) => {
            const x = labelWidth + measureIndex * measureWidth;

            return (
              <g key={`measure-${measure.bar}`}>
                <text className="preview-axis" x={x + 8} y="18">
                  Bar {measure.bar} / 第 {measure.bar} 小节
                </text>
                <line className="preview-grid-line strong" x1={x} x2={x} y1="24" y2={height - 14} />
                {Array.from({ length: 4 }, (_, beatIndex) => {
                  const beatX = x + (measureWidth / 4) * (beatIndex + 1);
                  return <line className="preview-grid-line" key={`beat-${measure.bar}-${beatIndex}`} x1={beatX} x2={beatX} y1="24" y2={height - 14} />;
                })}

                {measure.notes.map((note) => {
                  const laneIndex = lanes.findIndex(
                    (lane) => lane.label === (note.drumLabel ?? (note.midiNote != null ? `MIDI ${note.midiNote}` : "Drum"))
                  );
                  const { beat } = resolveBarBeat(note, bpm);
                  const hitX = x + ((beat - 1) / 4) * measureWidth + 14;
                  const hitY = 26 + laneIndex * rowHeight + 4;

                  return (
                    <g key={note.id}>
                      <line className="drum-hit" x1={hitX} x2={hitX + 10} y1={hitY} y2={hitY + 10} />
                      <line className="drum-hit" x1={hitX} x2={hitX + 10} y1={hitY + 10} y2={hitY} />
                    </g>
                  );
                })}
              </g>
            );
          })}

          <line className="preview-grid-line strong" x1={labelWidth + measureWidth * measures.length} x2={labelWidth + measureWidth * measures.length} y1="24" y2={height - 14} />
        </svg>
      </div>
    </div>
  );
}
