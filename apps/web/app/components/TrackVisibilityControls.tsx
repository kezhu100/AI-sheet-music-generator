"use client";

import type { PreviewTrack } from "@ai-sheet-music-generator/music-engine";

interface TrackVisibilityControlsProps {
  tracks: PreviewTrack[];
  visibleTrackKeys: string[];
  onToggleTrack: (trackKey: string) => void;
  onShowAllTracks: () => void;
  onHideAllTracks: () => void;
}

export function TrackVisibilityControls({
  tracks,
  visibleTrackKeys,
  onToggleTrack,
  onShowAllTracks,
  onHideAllTracks
}: TrackVisibilityControlsProps) {
  if (tracks.length === 0) {
    return (
      <p className="muted">
        Track controls appear after a completed result is ready. / 完成生成后会显示轨道控制。
      </p>
    );
  }

  return (
    <div className="visibility-panel">
      <div className="visibility-header">
        <p className="muted">
          Keep only the layers you want to inspect in the score view and the editing workspace. /
          只保留你想在乐谱视图与编辑工作区中查看的轨道层。
        </p>
        <div className="actions">
          <button className="button secondary small" onClick={onShowAllTracks} type="button">
            Show All / 全部显示
          </button>
          <button className="button secondary small" onClick={onHideAllTracks} type="button">
            Hide All / 全部隐藏
          </button>
        </div>
      </div>

      <div className="toggle-grid">
        {tracks.map((track) => {
          const isVisible = visibleTrackKeys.includes(track.key);

          return (
            <label className={`track-toggle ${isVisible ? "is-visible" : ""}`} key={track.key}>
              <input checked={isVisible} onChange={() => onToggleTrack(track.key)} type="checkbox" />
              <span>
                <strong>{track.label}</strong>
                <span className="muted">
                  {track.eventCount} events / 事件 · {track.provider}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
