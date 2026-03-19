"use client";

import {
  getPianoStaffPlacement,
  groupNotesByBar,
  midiToNoteName,
  resolveBarBeat
} from "@ai-sheet-music-generator/music-engine";
import type { TrackResult } from "@ai-sheet-music-generator/shared-types";

interface PianoScorePreviewProps {
  track: TrackResult | null;
  bpm: number;
}

const STAFF_LINE_SPACING = 12;

export function PianoScorePreview({ track, bpm }: PianoScorePreviewProps) {
  if (!track) {
    return <p className="muted">A visible piano track is required before the score preview can render. / 需要先显示钢琴轨道，才能渲染乐谱预览。</p>;
  }

  const pitchedNotes = track.notes.filter((note) => note.pitch != null);

  if (pitchedNotes.length === 0) {
    return <p className="muted">No pitched piano notes are available for score preview in the current visible track set. / 当前可见轨道中没有可用于乐谱预览的钢琴音符。</p>;
  }

  const measures = groupNotesByBar(pitchedNotes, bpm, 8);

  return (
    <div className="result-window result-window-score">
      <div className="result-window-toolbar muted">
        <span>Score Reader / 乐谱阅读窗</span>
        <span>Scroll inside the window to browse the draft score bar by bar. / 可在窗口内滚动，按小节浏览草稿乐谱。</span>
      </div>
      <div className="result-window-viewport result-window-viewport-score">
        <div className="measure-grid">
      {measures.map((measure) => (
        <article className="measure-card" key={`piano-measure-${measure.bar}`}>
          <div className="measure-meta">
            <strong>Bar {measure.bar} / 第 {measure.bar} 小节</strong>
            <span className="muted">{measure.notes.length} notes / 音符</span>
          </div>

          <svg aria-label={`Piano score bar ${measure.bar}`} className="score-measure-svg" role="img" viewBox="0 0 220 230">
            <rect fill="rgba(255,255,255,0.86)" height="230" rx="18" width="220" x="0" y="0" />

            {renderStaff(46)}
            {renderStaff(136)}
            <text className="staff-clef" x="12" y="74">
              G
            </text>
            <text className="staff-clef" x="12" y="164">
              F
            </text>
            <line className="preview-grid-line strong" x1="44" x2="44" y1="38" y2="188" />
            <line className="preview-grid-line strong" x1="202" x2="202" y1="38" y2="188" />

            {measure.notes.map((note) => {
              const pitch = note.pitch ?? 60;
              const placement = getPianoStaffPlacement(pitch);
              const { beat } = resolveBarBeat(note, bpm);
              const x = 56 + ((beat - 1) / 4) * 132;
              const bottomLineY = placement.clef === "treble" ? 94 : 184;
              const y = bottomLineY - placement.stepOffset * (STAFF_LINE_SPACING / 2);
              const stemDirection = placement.clef === "treble" ? -1 : 1;
              const stemStartX = x + (stemDirection === -1 ? 7 : -7);
              const stemEndY = y + stemDirection * 28;

              return (
                <g key={note.id}>
                  <ellipse className="score-notehead" cx={x} cy={y} rx="7" ry="5" />
                  <line className="score-stem" x1={stemStartX} x2={stemStartX} y1={y} y2={stemEndY} />
                  <text className="score-note-label" x={x - 12} y={placement.clef === "treble" ? 28 : 216}>
                    {midiToNoteName(pitch)}
                  </text>
                </g>
              );
            })}
          </svg>
        </article>
      ))}
        </div>
      </div>
    </div>
  );
}

function renderStaff(startY: number) {
  return Array.from({ length: 5 }, (_, index) => {
    const y = startY + index * STAFF_LINE_SPACING;
    return <line className="preview-grid-line strong" key={`staff-line-${startY}-${index}`} x1="44" x2="202" y1={y} y2={y} />;
  });
}
