"use client";

import { getNoteDurationSec, getTrackKey, midiToNoteName } from "@ai-sheet-music-generator/music-engine";
import type { JobResult, NoteEvent, TrackResult } from "@ai-sheet-music-generator/shared-types";

interface NoteEditorPanelProps {
  draftResult: JobResult | null;
  hasDraftChanges: boolean;
  selectedTrack: TrackResult | null;
  selectedNote: NoteEvent | null;
  addTrackKey: string;
  addOnsetSec: number;
  addDurationSec: number;
  addPitch: number;
  addDrumLabel: string;
  addDrumMidiNote: number;
  onSelectAddTrack: (trackKey: string) => void;
  onChangeAddOnsetSec: (value: number) => void;
  onChangeAddDurationSec: (value: number) => void;
  onChangeAddPitch: (value: number) => void;
  onChangeAddDrumLabel: (value: string) => void;
  onChangeAddDrumMidiNote: (value: number) => void;
  onChangeSelectedOnsetSec: (value: number) => void;
  onChangeSelectedDurationSec: (value: number) => void;
  onChangeSelectedPitch: (value: number) => void;
  onDeleteSelectedNote: () => void;
  onAddNote: () => void;
  onRevertDraft: () => void;
}

export function NoteEditorPanel({
  draftResult,
  hasDraftChanges,
  selectedTrack,
  selectedNote,
  addTrackKey,
  addOnsetSec,
  addDurationSec,
  addPitch,
  addDrumLabel,
  addDrumMidiNote,
  onSelectAddTrack,
  onChangeAddOnsetSec,
  onChangeAddDurationSec,
  onChangeAddPitch,
  onChangeAddDrumLabel,
  onChangeAddDrumMidiNote,
  onChangeSelectedOnsetSec,
  onChangeSelectedDurationSec,
  onChangeSelectedPitch,
  onDeleteSelectedNote,
  onAddNote,
  onRevertDraft
}: NoteEditorPanelProps) {
  if (!draftResult) {
    return <p className="muted">Editing controls unlock after a completed job returns a normalized result.</p>;
  }

  const selectedDurationSec = selectedNote ? getNoteDurationSec(selectedNote, draftResult.bpm) : 0.25;
  const addTrack = draftResult.tracks.find((track) => getTrackKey(track) === addTrackKey) ?? null;

  return (
    <div className="editor-panel">
      <div className="editor-status">
        <div>
          <strong>{hasDraftChanges ? "Draft edited" : "Draft matches generated result"}</strong>
          <div className="muted">
            Phase 8 keeps edits in the browser. Exports use this draft only when changes have been made.
          </div>
        </div>
        <button className="button secondary small" disabled={!hasDraftChanges} onClick={onRevertDraft} type="button">
          Revert draft
        </button>
      </div>

      <div className="editor-grid">
        <article className="note-card">
          <h3>Selected Note</h3>
          {selectedTrack && selectedNote ? (
            <div className="editor-fields">
              <div className="muted">
                {selectedTrack.instrument} | {selectedTrack.sourceStem}
              </div>
              <label className="field">
                <span>Onset (sec)</span>
                <input
                  min={0}
                  onChange={(event) => onChangeSelectedOnsetSec(Number(event.target.value))}
                  step={0.125}
                  type="number"
                  value={selectedNote.onsetSec}
                />
              </label>
              <label className="field">
                <span>Duration (sec)</span>
                <input
                  min={0.125}
                  onChange={(event) => onChangeSelectedDurationSec(Number(event.target.value))}
                  step={0.125}
                  type="number"
                  value={selectedDurationSec}
                />
              </label>
              {selectedTrack.instrument === "piano" ? (
                <label className="field">
                  <span>Pitch</span>
                  <input
                    max={108}
                    min={21}
                    onChange={(event) => onChangeSelectedPitch(Number(event.target.value))}
                    step={1}
                    type="number"
                    value={selectedNote.pitch ?? 60}
                  />
                </label>
              ) : (
                <div className="muted">Drum lane reassignment is not part of this MVP. Timing, add, and delete are supported.</div>
              )}
              <div className="muted">
                {selectedTrack.instrument === "piano"
                  ? midiToNoteName(selectedNote.pitch ?? 60)
                  : `${selectedNote.drumLabel ?? "Drum"} (${selectedNote.midiNote ?? "n/a"})`}
              </div>
              <button className="button secondary small" onClick={onDeleteSelectedNote} type="button">
                Delete selected note
              </button>
            </div>
          ) : (
            <p className="muted">Select a note in the piano roll or in the event lists to edit it.</p>
          )}
        </article>

        <article className="note-card">
          <h3>Add Note</h3>
          <div className="editor-fields">
            <label className="field">
              <span>Track</span>
              <select onChange={(event) => onSelectAddTrack(event.target.value)} value={addTrackKey}>
                {draftResult.tracks.map((track) => {
                  const key = getTrackKey(track);
                  return (
                    <option key={key} value={key}>
                      {track.instrument} | {track.sourceStem}
                    </option>
                  );
                })}
              </select>
            </label>
            <label className="field">
              <span>Onset (sec)</span>
              <input
                min={0}
                onChange={(event) => onChangeAddOnsetSec(Number(event.target.value))}
                step={0.125}
                type="number"
                value={addOnsetSec}
              />
            </label>
            <label className="field">
              <span>Duration (sec)</span>
              <input
                min={0.125}
                onChange={(event) => onChangeAddDurationSec(Number(event.target.value))}
                step={0.125}
                type="number"
                value={addDurationSec}
              />
            </label>
            {addTrack?.instrument === "piano" ? (
              <label className="field">
                <span>Pitch</span>
                <input
                  max={108}
                  min={21}
                  onChange={(event) => onChangeAddPitch(Number(event.target.value))}
                  step={1}
                  type="number"
                  value={addPitch}
                />
              </label>
            ) : (
              <>
                <label className="field">
                  <span>Drum label</span>
                  <input onChange={(event) => onChangeAddDrumLabel(event.target.value)} type="text" value={addDrumLabel} />
                </label>
                <label className="field">
                  <span>Drum MIDI</span>
                  <input
                    max={127}
                    min={0}
                    onChange={(event) => onChangeAddDrumMidiNote(Number(event.target.value))}
                    step={1}
                    type="number"
                    value={addDrumMidiNote}
                  />
                </label>
              </>
            )}
            <button className="button small" onClick={onAddNote} type="button">
              Add note
            </button>
          </div>
        </article>
      </div>
    </div>
  );
}
