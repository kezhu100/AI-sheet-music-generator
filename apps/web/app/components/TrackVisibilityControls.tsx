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
    return <p className="muted">Track toggles appear after a completed job returns normalized tracks.</p>;
  }

  return (
    <div className="visibility-panel">
      <div className="visibility-header">
        <p className="muted">Preview only the tracks you want to inspect. These toggles affect all Phase 7 preview panes.</p>
        <div className="actions">
          <button className="button secondary small" type="button" onClick={onShowAllTracks}>
            Show all
          </button>
          <button className="button secondary small" type="button" onClick={onHideAllTracks}>
            Hide all
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
                  {track.eventCount} events | {track.provider}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
