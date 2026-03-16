"use client";

import { getNoteDurationSec, getTrackKey, midiToNoteName } from "@ai-sheet-music-generator/music-engine";
import type { JobResult, NoteEvent, TrackResult } from "@ai-sheet-music-generator/shared-types";
import type { RetranscriptionRegionSelection } from "../hooks/useEditableJobResult";

interface NoteEditorPanelProps {
  draftResult: JobResult | null;
  hasDraftChanges: boolean;
  hasSavedDraft: boolean;
  savedDraftVersion: number | null;
  savedDraftSavedAt: string | null;
  isSavingDraft: boolean;
  canUndo: boolean;
  canRedo: boolean;
  retranscriptionRegion: RetranscriptionRegionSelection | null;
  isRetranscribingRegion: boolean;
  selectedTrack: TrackResult | null;
  selectedNote: NoteEvent | null;
  selectedNotes: NoteEvent[];
  addTrackKey: string;
  addOnsetSec: number;
  addDurationSec: number;
  addPitch: number;
  addDrumLabel: string;
  addDrumMidiNote: number;
  reassignDrumLabel: string;
  reassignDrumMidiNote: number;
  onSelectAddTrack: (trackKey: string) => void;
  onChangeAddOnsetSec: (value: number) => void;
  onChangeAddDurationSec: (value: number) => void;
  onChangeAddPitch: (value: number) => void;
  onChangeAddDrumLabel: (value: string) => void;
  onChangeAddDrumMidiNote: (value: number) => void;
  onChangeReassignDrumLabel: (value: string) => void;
  onChangeReassignDrumMidiNote: (value: number) => void;
  onChangeSelectedOnsetSec: (value: number) => void;
  onChangeSelectedDurationSec: (value: number) => void;
  onChangeSelectedPitch: (value: number) => void;
  onDeleteSelectedNotes: () => void;
  onQuantizeSelection: (subdivision: number) => void;
  onQuantizeAll: (subdivision: number) => void;
  onReassignSelectedDrumLane: () => void;
  onRetranscribeRegion: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onAddNote: () => void;
  onSaveDraft: () => void;
  onRevertDraft: () => void;
  onRestoreSavedDraft: () => void;
}

export function NoteEditorPanel({
  draftResult,
  hasDraftChanges,
  hasSavedDraft,
  savedDraftVersion,
  savedDraftSavedAt,
  isSavingDraft,
  canUndo,
  canRedo,
  retranscriptionRegion,
  isRetranscribingRegion,
  selectedTrack,
  selectedNote,
  selectedNotes,
  addTrackKey,
  addOnsetSec,
  addDurationSec,
  addPitch,
  addDrumLabel,
  addDrumMidiNote,
  reassignDrumLabel,
  reassignDrumMidiNote,
  onSelectAddTrack,
  onChangeAddOnsetSec,
  onChangeAddDurationSec,
  onChangeAddPitch,
  onChangeAddDrumLabel,
  onChangeAddDrumMidiNote,
  onChangeReassignDrumLabel,
  onChangeReassignDrumMidiNote,
  onChangeSelectedOnsetSec,
  onChangeSelectedDurationSec,
  onChangeSelectedPitch,
  onDeleteSelectedNotes,
  onQuantizeSelection,
  onQuantizeAll,
  onReassignSelectedDrumLane,
  onRetranscribeRegion,
  onUndo,
  onRedo,
  onAddNote,
  onSaveDraft,
  onRevertDraft,
  onRestoreSavedDraft
}: NoteEditorPanelProps) {
  if (!draftResult) {
    return <p className="muted">Editing controls unlock after a completed job returns a normalized result.</p>;
  }

  const selectedDurationSec = selectedNote ? getNoteDurationSec(selectedNote, draftResult.bpm) : 0.25;
  const addTrack = draftResult.tracks.find((track) => getTrackKey(track) === addTrackKey) ?? null;
  const selectionCount = selectedNotes.length;
  const allSelectedAreDrums = selectionCount > 0 && selectedNotes.every((note) => note.instrument === "drums");
  const canRetranscribeRegion =
    retranscriptionRegion != null &&
    retranscriptionRegion.instrument != null &&
    retranscriptionRegion.endSec > retranscriptionRegion.startSec;

  return (
    <div className="editor-panel">
      <div className="editor-status">
        <div>
          <strong>{hasDraftChanges ? "Draft edited" : "Draft matches generated result"}</strong>
          <div className="muted">
            {hasSavedDraft
              ? `Saved draft v${savedDraftVersion ?? 1}${savedDraftSavedAt ? ` from ${new Date(savedDraftSavedAt).toLocaleString()}` : ""}.`
              : "No saved draft yet."}
          </div>
        </div>
        <div className="actions">
          <button className="button secondary small" disabled={!canUndo} onClick={onUndo} type="button">
            Undo
          </button>
          <button className="button secondary small" disabled={!canRedo} onClick={onRedo} type="button">
            Redo
          </button>
          <button className="button small" disabled={isSavingDraft} onClick={onSaveDraft} type="button">
            {isSavingDraft ? "Saving..." : "Save draft"}
          </button>
          <button className="button secondary small" onClick={onRevertDraft} type="button">
            Reset to original
          </button>
          <button className="button secondary small" disabled={!hasSavedDraft} onClick={onRestoreSavedDraft} type="button">
            Reload saved draft
          </button>
        </div>
      </div>

      <div className="editor-grid">
        <article className="note-card">
          <h3>{selectionCount > 1 ? `Selected Notes (${selectionCount})` : "Selected Note"}</h3>
          {selectedTrack && selectedNote ? (
            <div className="editor-fields">
              <div className="muted">
                {selectionCount > 1
                  ? `${selectionCount} notes selected across the current draft`
                  : `${selectedTrack.instrument} | ${selectedTrack.sourceStem}`}
              </div>
              {selectionCount === 1 ? (
                <>
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
                  ) : null}
                  <div className="muted">
                    {selectedTrack.instrument === "piano"
                      ? midiToNoteName(selectedNote.pitch ?? 60)
                      : `${selectedNote.drumLabel ?? "Drum"} (${selectedNote.midiNote ?? "n/a"})`}
                  </div>
                </>
              ) : (
                <div className="muted">
                  Multi-selection supports delete, drag timing, quantize, keyboard nudging, and drum lane reassignment.
                </div>
              )}

              <div className="bulk-actions">
                <strong>Quantize</strong>
                <div className="actions">
                  <button className="button secondary small" disabled={selectionCount === 0} onClick={() => onQuantizeSelection(1)} type="button">
                    Selected to beats
                  </button>
                  <button className="button secondary small" disabled={selectionCount === 0} onClick={() => onQuantizeSelection(2)} type="button">
                    Selected to 1/8
                  </button>
                  <button className="button secondary small" disabled={selectionCount === 0} onClick={() => onQuantizeSelection(4)} type="button">
                    Selected to 1/16
                  </button>
                  <button className="button secondary small" onClick={() => onQuantizeAll(4)} type="button">
                    Whole draft to 1/16
                  </button>
                </div>
              </div>

              <div className="bulk-actions">
                <strong>Region Re-transcription</strong>
                <div className="muted">
                  {retranscriptionRegion
                    ? `Region ${retranscriptionRegion.startSec.toFixed(3)}s-${retranscriptionRegion.endSec.toFixed(3)}s | ${
                        retranscriptionRegion.instrument ?? "mixed selection"
                      }`
                    : "Draw a box in the piano roll to choose a time region for piano or drums."}
                </div>
                <div className="actions">
                  <button
                    className="button secondary small"
                    disabled={!canRetranscribeRegion || isRetranscribingRegion}
                    onClick={onRetranscribeRegion}
                    type="button"
                  >
                    {isRetranscribingRegion ? "Re-transcribing..." : "Re-transcribe region"}
                  </button>
                </div>
              </div>

              {allSelectedAreDrums ? (
                <div className="editor-fields section">
                  <strong>Drum lane reassignment</strong>
                  <label className="field">
                    <span>Drum label</span>
                    <input
                      onChange={(event) => onChangeReassignDrumLabel(event.target.value)}
                      type="text"
                      value={reassignDrumLabel}
                    />
                  </label>
                  <label className="field">
                    <span>Drum MIDI</span>
                    <input
                      max={127}
                      min={0}
                      onChange={(event) => onChangeReassignDrumMidiNote(Number(event.target.value))}
                      step={1}
                      type="number"
                      value={reassignDrumMidiNote}
                    />
                  </label>
                  <button className="button secondary small" onClick={onReassignSelectedDrumLane} type="button">
                    Reassign selected drums
                  </button>
                </div>
              ) : null}

              <div className="muted">
                Keyboard: `Delete` removes selection, `Ctrl/Cmd+Z` undo, `Ctrl/Cmd+Y` redo, arrows nudge timing, and piano selections use up/down arrows for pitch.
              </div>
              <button className="button secondary small" disabled={selectionCount === 0} onClick={onDeleteSelectedNotes} type="button">
                {selectionCount > 1 ? "Delete selected notes" : "Delete selected note"}
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
            <div className="muted">
              Box-select in the piano roll to edit several notes together. Use Ctrl/Cmd-click to add or remove notes from the current selection.
            </div>
          </div>
        </article>
      </div>
    </div>
  );
}
