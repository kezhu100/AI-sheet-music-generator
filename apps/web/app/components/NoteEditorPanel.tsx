"use client";

import { getNoteDurationSec, getTrackKey, midiToNoteName } from "@ai-sheet-music-generator/music-engine";
import type {
  CorrectionSuggestion,
  JobResult,
  NoteEvent,
  TrackResult
} from "@ai-sheet-music-generator/shared-types";
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
  suggestions: CorrectionSuggestion[];
  isAnalyzingDraft: boolean;
  suggestionsStale: boolean;
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
  onAnalyzeDraft: () => void;
  onApplySuggestion: (suggestion: CorrectionSuggestion) => void;
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
  suggestions,
  isAnalyzingDraft,
  suggestionsStale,
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
  onAnalyzeDraft,
  onApplySuggestion,
  onUndo,
  onRedo,
  onAddNote,
  onSaveDraft,
  onRevertDraft,
  onRestoreSavedDraft
}: NoteEditorPanelProps) {
  if (!draftResult) {
    return (
      <p className="muted">
        Editing tools appear after a completed result is ready. / 完成生成后会显示编辑工具。
      </p>
    );
  }

  const selectedDurationSec = selectedNote ? getNoteDurationSec(selectedNote, draftResult.bpm) : 0.25;
  const addTrack = draftResult.tracks.find((track) => getTrackKey(track) === addTrackKey) ?? null;
  const selectionCount = selectedNotes.length;
  const allSelectedAreDrums =
    selectionCount > 0 && selectedNotes.every((note) => note.instrument === "drums");
  const canRetranscribeRegion =
    retranscriptionRegion != null &&
    retranscriptionRegion.instrument != null &&
    retranscriptionRegion.endSec > retranscriptionRegion.startSec;
  const selectedSuggestionCount = selectedNotes.reduce(
    (count, note) =>
      count +
      (note.draftNoteId &&
      suggestions.some((suggestion) => suggestion.noteId === note.draftNoteId)
        ? 1
        : 0),
    0
  );

  return (
    <div className="editor-panel">
      <div className="editor-status">
        <div>
          <strong>
            {hasDraftChanges
              ? "Draft Updated / 草稿已修改"
              : "Draft Matches Source / 草稿与原结果一致"}
          </strong>
          <div className="muted">
            {hasSavedDraft
              ? `Saved draft v${savedDraftVersion ?? 1} / 已保存草稿 v${savedDraftVersion ?? 1}${
                  savedDraftSavedAt ? ` · ${new Date(savedDraftSavedAt).toLocaleString()}` : ""
                }`
              : "No saved draft yet / 还没有已保存草稿"}
          </div>
        </div>
        <div className="actions">
          <button className="button secondary small" disabled={!canUndo} onClick={onUndo} type="button">
            Undo / 撤销
          </button>
          <button className="button secondary small" disabled={!canRedo} onClick={onRedo} type="button">
            Redo / 重做
          </button>
          <button className="button small" disabled={isSavingDraft} onClick={onSaveDraft} type="button">
            {isSavingDraft ? "Saving... / 保存中..." : "Save Draft / 保存草稿"}
          </button>
          <button
            className="button secondary small"
            disabled={!hasSavedDraft}
            onClick={onRestoreSavedDraft}
            type="button"
          >
            Restore Saved / 恢复已保存
          </button>
        </div>
      </div>

      <div className="editor-grid editor-grid-wide">
        <article className="note-card ornate-card">
          <h3>{selectionCount > 1 ? `Selection / 当前选择 (${selectionCount})` : "Selection / 当前选择"}</h3>
          {selectedTrack && selectedNote ? (
            <div className="editor-fields">
              <div className="muted">
                {selectionCount > 1
                  ? `${selectionCount} notes selected / 已选择 ${selectionCount} 个音符`
                  : `Selected track / 当前轨道: ${selectedTrack.instrument} | ${selectedTrack.sourceStem}`}
              </div>

              {selectionCount === 1 ? (
                <div className="editor-grid compact-two-col">
                  <label className="field">
                    <span>Onset (sec) / 起点</span>
                    <input
                      min={0}
                      onChange={(event) => onChangeSelectedOnsetSec(Number(event.target.value))}
                      step={0.125}
                      type="number"
                      value={selectedNote.onsetSec}
                    />
                  </label>
                  <label className="field">
                    <span>Duration (sec) / 时值</span>
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
                      <span>Pitch / 音高</span>
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
                </div>
              ) : (
                <p className="muted">
                  Multi-selection supports delete, drag timing, quantize, and drum lane reassignment. /
                  多选支持删除、拖动时值、量化和鼓组轨道重分配。
                </p>
              )}

              <div className="note-inline-hint muted">
                {selectedTrack.instrument === "piano"
                  ? `Pitch name / 音名: ${midiToNoteName(selectedNote.pitch ?? 60)}`
                  : `Drum lane / 鼓组轨道: ${selectedNote.drumLabel ?? "Drum"} (${selectedNote.midiNote ?? "n/a"})`}
              </div>

              <button
                className="button secondary small"
                disabled={selectionCount === 0}
                onClick={onDeleteSelectedNotes}
                type="button"
              >
                {selectionCount > 1 ? "Delete Selection / 删除已选" : "Delete Note / 删除音符"}
              </button>
            </div>
          ) : (
            <p className="muted">
              Select a note from the track editor to begin editing. / 先在轨道编辑器中选择音符，再开始编辑。
            </p>
          )}
        </article>

        <article className="note-card ornate-card">
          <h3>Quick Edit / 快速编辑</h3>
          <div className="editor-fields">
            <div className="actions">
              <button
                className="button secondary small"
                disabled={selectionCount === 0}
                onClick={() => onQuantizeSelection(1)}
                type="button"
              >
                To Beats / 量化到拍
              </button>
              <button
                className="button secondary small"
                disabled={selectionCount === 0}
                onClick={() => onQuantizeSelection(2)}
                type="button"
              >
                To 1/8 / 量化到八分
              </button>
              <button
                className="button secondary small"
                disabled={selectionCount === 0}
                onClick={() => onQuantizeSelection(4)}
                type="button"
              >
                To 1/16 / 量化到十六分
              </button>
              <button className="button secondary small" onClick={() => onQuantizeAll(4)} type="button">
                Quantize All / 全局量化
              </button>
            </div>

            {allSelectedAreDrums ? (
              <div className="editor-fields section">
                <strong>Drum Lane / 鼓组轨道</strong>
                <label className="field">
                  <span>Drum Label / 鼓组标签</span>
                  <input
                    onChange={(event) => onChangeReassignDrumLabel(event.target.value)}
                    type="text"
                    value={reassignDrumLabel}
                  />
                </label>
                <label className="field">
                  <span>Drum MIDI / 鼓组 MIDI</span>
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
                  Apply Drum Lane / 应用鼓组轨道
                </button>
              </div>
            ) : null}

            <p className="muted">
              Keyboard: Delete removes selection, Ctrl/Cmd+Z undo, Ctrl/Cmd+Y redo, arrow keys nudge
              timing, and piano selections use up/down for pitch. / 键盘支持删除、撤销、重做、时值微调和音高调整。
            </p>
          </div>
        </article>

        <article className="note-card ornate-card">
          <h3>Add Note / 添加音符</h3>
          <div className="editor-fields">
            <label className="field">
              <span>Track / 轨道</span>
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

            <div className="editor-grid compact-two-col">
              <label className="field">
                <span>Onset (sec) / 起点</span>
                <input
                  min={0}
                  onChange={(event) => onChangeAddOnsetSec(Number(event.target.value))}
                  step={0.125}
                  type="number"
                  value={addOnsetSec}
                />
              </label>
              <label className="field">
                <span>Duration (sec) / 时值</span>
                <input
                  min={0.125}
                  onChange={(event) => onChangeAddDurationSec(Number(event.target.value))}
                  step={0.125}
                  type="number"
                  value={addDurationSec}
                />
              </label>
            </div>

            {addTrack?.instrument === "piano" ? (
              <label className="field">
                <span>Pitch / 音高</span>
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
              <div className="editor-grid compact-two-col">
                <label className="field">
                  <span>Drum Label / 鼓组标签</span>
                  <input
                    onChange={(event) => onChangeAddDrumLabel(event.target.value)}
                    type="text"
                    value={addDrumLabel}
                  />
                </label>
                <label className="field">
                  <span>Drum MIDI / 鼓组 MIDI</span>
                  <input
                    max={127}
                    min={0}
                    onChange={(event) => onChangeAddDrumMidiNote(Number(event.target.value))}
                    step={1}
                    type="number"
                    value={addDrumMidiNote}
                  />
                </label>
              </div>
            )}

            <button className="button small" onClick={onAddNote} type="button">
              Add Note / 添加音符
            </button>
          </div>
        </article>

        <article className="note-card ornate-card">
          <h3>Draft Tools / 草稿工具</h3>
          <div className="editor-fields">
            <div className="muted">
              {hasSavedDraft
                ? `Saved draft v${savedDraftVersion ?? 1} / 已保存草稿 v${savedDraftVersion ?? 1}${
                    savedDraftSavedAt ? ` · ${new Date(savedDraftSavedAt).toLocaleString()}` : ""
                  }`
                : "No saved draft baseline yet / 还没有保存草稿基线"}
            </div>
            <div className="actions">
              <button className="button secondary small" onClick={onRevertDraft} type="button">
                Reset to Original / 恢复原始结果
              </button>
              <button
                className="button secondary small"
                disabled={!hasSavedDraft}
                onClick={onRestoreSavedDraft}
                type="button"
              >
                Restore Saved Draft / 恢复已保存草稿
              </button>
              <button
                className="button secondary small"
                disabled={isAnalyzingDraft}
                onClick={onAnalyzeDraft}
                type="button"
              >
                {isAnalyzingDraft ? "Analyzing... / 分析中..." : "Analyze Draft / 分析草稿"}
              </button>
            </div>
          </div>
        </article>

        <article className="note-card ornate-card editor-grid-span-2">
          <h3>Advanced Tools / 高级工具</h3>
          <div className="editor-fields">
            <div className="muted">
              {retranscriptionRegion
                ? `Region / 区域: ${retranscriptionRegion.startSec.toFixed(3)}s - ${retranscriptionRegion.endSec.toFixed(
                    3
                  )}s · ${retranscriptionRegion.instrument ?? "mixed"}`
                : "Draw a box in the piano roll to choose a piano or drum region. / 在钢琴卷帘中框选区域，用于钢琴或鼓组重转写。"}
            </div>
            <div className="actions">
              <button
                className="button secondary small"
                disabled={!canRetranscribeRegion || isRetranscribingRegion}
                onClick={onRetranscribeRegion}
                type="button"
              >
                {isRetranscribingRegion
                  ? "Re-transcribing... / 重转写中..."
                  : "Re-transcribe Region / 重转写区域"}
              </button>
            </div>
            <div className="muted">
              {suggestionsStale
                ? "The draft changed since the last analysis. Run Analyze Draft again to refresh suggestions. / 草稿已发生变化，请重新分析以刷新建议。"
                : suggestions.length > 0
                  ? `${suggestions.length} active suggestions / 当前有 ${suggestions.length} 条建议${
                      selectedSuggestionCount > 0
                        ? ` · ${selectedSuggestionCount} on the current selection`
                        : ""
                    }`
                  : "No active suggestions yet. / 目前还没有建议。"}
            </div>
            {suggestions.length > 0 ? (
              <div className="note-list compact-list">
                {suggestions.map((suggestion) => (
                  <article className="note-card ornate-card" key={`${suggestion.type}-${suggestion.noteId}`}>
                    <strong>
                      {suggestion.instrument} | {suggestion.type}
                    </strong>
                    <div>{suggestion.message}</div>
                    <div className="muted">Target / 目标: {suggestion.noteId}</div>
                    <div className="actions">
                      <button
                        className="button secondary small"
                        onClick={() => onApplySuggestion(suggestion)}
                        type="button"
                      >
                        Apply Suggestion / 应用建议
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}
          </div>
        </article>
      </div>
    </div>
  );
}
