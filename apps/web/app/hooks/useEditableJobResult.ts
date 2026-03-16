"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addNote,
  applyCorrectionSuggestion,
  areJobResultsEqual,
  cloneJobResult,
  deleteNotes,
  moveNotesByDelta,
  normalizeEditedResult,
  quantizeDraftNotes,
  replaceInstrumentRegionNotes,
  reassignDrumLane,
  resetDraftFromOriginal,
  sanitizeDraftNoteIds,
  selectNote,
  selectNotes,
  transposeNotes,
  updateNoteDuration,
  updateNotePitch,
  updateNoteTiming
} from "@ai-sheet-music-generator/music-engine";
import type { AddDraftNoteInput, SelectedDraftNote } from "@ai-sheet-music-generator/music-engine";
import type {
  CorrectionSuggestion,
  JobDraftRecord,
  JobResult,
  RegionRetranscriptionResponse
} from "@ai-sheet-music-generator/shared-types";
import { retranscribeRegion as requestRegionRetranscription } from "../../lib/api";

const MAX_HISTORY_ENTRIES = 50;

interface DraftHistoryEntry {
  draftResult: JobResult;
  selectedDraftNoteIds: string[];
  primarySelectedDraftNoteId: string | null;
}

interface SelectDraftNoteOptions {
  additive?: boolean;
}

interface ReplaceSelectionOptions {
  additive?: boolean;
  primaryDraftNoteId?: string | null;
}

export interface RetranscriptionRegionSelection {
  instrument: "piano" | "drums" | null;
  startSec: number;
  endSec: number;
}

export interface EditableJobResultState {
  draftResult: JobResult | null;
  activeResult: JobResult | null;
  isDraftDirty: boolean;
  hasSavedDraft: boolean;
  savedDraftVersion: number | null;
  savedDraftSavedAt: string | null;
  canUndo: boolean;
  canRedo: boolean;
  selectedDraftNoteId: string | null;
  selectedDraftNoteIds: string[];
  selectedDraftNote: SelectedDraftNote | null;
  selectedDraftNotes: SelectedDraftNote[];
  selectedTrack: SelectedDraftNote["track"] | null;
  selectedNote: SelectedDraftNote["note"] | null;
  selectedTrackKey: string | null;
  retranscriptionRegion: RetranscriptionRegionSelection | null;
  isRetranscribingRegion: boolean;
  selectDraftNote: (draftNoteId: string, options?: SelectDraftNoteOptions) => void;
  replaceSelection: (draftNoteIds: string[], options?: ReplaceSelectionOptions) => void;
  clearSelection: () => void;
  setRetranscriptionRegion: (region: RetranscriptionRegionSelection | null) => void;
  clearRetranscriptionRegion: () => void;
  clearEditableState: () => void;
  applyDraftUpdate: (
    mutator: (draft: JobResult) => JobResult,
    options?: { selectedDraftNoteIds?: string[]; primarySelectedDraftNoteId?: string | null }
  ) => void;
  updateSelectedNote: (mutator: (draft: JobResult, draftNoteId: string) => JobResult) => void;
  addDraftNote: (input: AddDraftNoteInput) => void;
  deleteSelectedNotes: () => void;
  moveNote: (draftNoteId: string, onsetSec: number) => void;
  changeSelectedDuration: (durationSec: number) => void;
  changeSelectedPitch: (pitch: number) => void;
  transposeSelectedPianoNotes: (semitones: number) => void;
  quantizeSelection: (subdivision: number) => void;
  quantizeAllNotes: (subdivision: number) => void;
  reassignSelectedDrumLane: (drumLabel: string, midiNote?: number) => void;
  undo: () => void;
  redo: () => void;
  selectAllNotes: () => void;
  resetDraftFromOriginalResult: () => void;
  restoreSavedDraft: () => void;
  getCurrentDraftResult: () => JobResult | undefined;
  retranscribeSelectedRegion: () => Promise<void>;
  applySuggestion: (suggestion: CorrectionSuggestion) => void;
}

function hydrateDraftResult(result: JobResult): JobResult {
  return normalizeEditedResult(cloneJobResult(result));
}

function sanitizeSelectionState(
  result: JobResult,
  selectedDraftNoteIds: string[],
  primarySelectedDraftNoteId: string | null
): { selectedDraftNoteIds: string[]; primarySelectedDraftNoteId: string | null } {
  const nextSelectedDraftNoteIds = sanitizeDraftNoteIds(result, selectedDraftNoteIds);
  const nextPrimarySelectedDraftNoteId =
    primarySelectedDraftNoteId && nextSelectedDraftNoteIds.includes(primarySelectedDraftNoteId)
      ? primarySelectedDraftNoteId
      : nextSelectedDraftNoteIds[0] ?? null;

  return {
    selectedDraftNoteIds: nextSelectedDraftNoteIds,
    primarySelectedDraftNoteId: nextPrimarySelectedDraftNoteId
  };
}

export function useEditableJobResult(
  result: JobResult | null,
  savedDraft: JobDraftRecord | null,
  jobId: string | null
): EditableJobResultState {
  const [originalResult, setOriginalResult] = useState<JobResult | null>(null);
  const [savedDraftRecord, setSavedDraftRecord] = useState<JobDraftRecord | null>(null);
  const [savedDraftResult, setSavedDraftResult] = useState<JobResult | null>(null);
  const [draftResult, setDraftResult] = useState<JobResult | null>(null);
  const [selectedDraftNoteIds, setSelectedDraftNoteIds] = useState<string[]>([]);
  const [primarySelectedDraftNoteId, setPrimarySelectedDraftNoteId] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<DraftHistoryEntry[]>([]);
  const [redoStack, setRedoStack] = useState<DraftHistoryEntry[]>([]);
  const [retranscriptionRegion, setRetranscriptionRegion] = useState<RetranscriptionRegionSelection | null>(null);
  const [isRetranscribingRegion, setIsRetranscribingRegion] = useState(false);

  useEffect(() => {
    if (!result) {
      setOriginalResult(null);
      setSavedDraftRecord(null);
      setSavedDraftResult(null);
      setDraftResult(null);
      setSelectedDraftNoteIds([]);
      setPrimarySelectedDraftNoteId(null);
      setUndoStack([]);
      setRedoStack([]);
      setRetranscriptionRegion(null);
      setIsRetranscribingRegion(false);
      return;
    }

    const nextDraftResult = savedDraft ? hydrateDraftResult(savedDraft.result) : resetDraftFromOriginal(result);
    setOriginalResult(result);
    setSavedDraftRecord(savedDraft);
    setSavedDraftResult(savedDraft ? nextDraftResult : null);
    setDraftResult(nextDraftResult);
    setSelectedDraftNoteIds([]);
    setPrimarySelectedDraftNoteId(null);
    setUndoStack([]);
    setRedoStack([]);
    setRetranscriptionRegion(null);
    setIsRetranscribingRegion(false);
  }, [result, savedDraft]);

  const activeResult = draftResult ?? result ?? null;
  const baselineDraftResult = savedDraftResult ?? (originalResult ? resetDraftFromOriginal(originalResult) : null);
  const isDraftDirty = useMemo(
    () => !areJobResultsEqual(draftResult, baselineDraftResult),
    [baselineDraftResult, draftResult]
  );
  const hasSavedDraft = savedDraftRecord != null;
  const selectionState = useMemo(
    () => (activeResult ? sanitizeSelectionState(activeResult, selectedDraftNoteIds, primarySelectedDraftNoteId) : null),
    [activeResult, primarySelectedDraftNoteId, selectedDraftNoteIds]
  );
  const stableSelectedDraftNoteIds = selectionState?.selectedDraftNoteIds ?? [];
  const stablePrimarySelectedDraftNoteId = selectionState?.primarySelectedDraftNoteId ?? null;

  const selectedDraftNotes = useMemo(() => {
    if (!activeResult || stableSelectedDraftNoteIds.length === 0) {
      return [];
    }

    return selectNotes(activeResult, stableSelectedDraftNoteIds);
  }, [activeResult, stableSelectedDraftNoteIds]);

  const selectedDraftNote = useMemo(() => {
    if (!activeResult || !stablePrimarySelectedDraftNoteId) {
      return null;
    }

    return selectNote(activeResult, stablePrimarySelectedDraftNoteId);
  }, [activeResult, stablePrimarySelectedDraftNoteId]);

  const selectedTrack = selectedDraftNote?.track ?? null;
  const selectedNote = selectedDraftNote?.note ?? null;
  const selectedTrackKey = selectedDraftNote?.selection.trackKey ?? null;

  useEffect(() => {
    if (!activeResult) {
      return;
    }

    if (
      stableSelectedDraftNoteIds.length !== selectedDraftNoteIds.length ||
      stablePrimarySelectedDraftNoteId !== primarySelectedDraftNoteId
    ) {
      setSelectedDraftNoteIds(stableSelectedDraftNoteIds);
      setPrimarySelectedDraftNoteId(stablePrimarySelectedDraftNoteId);
    }
  }, [
    activeResult,
    primarySelectedDraftNoteId,
    selectedDraftNoteIds.length,
    stablePrimarySelectedDraftNoteId,
    stableSelectedDraftNoteIds
  ]);

  function clearEditableState(): void {
    setOriginalResult(null);
    setSavedDraftRecord(null);
    setSavedDraftResult(null);
    setDraftResult(null);
    setSelectedDraftNoteIds([]);
    setPrimarySelectedDraftNoteId(null);
    setUndoStack([]);
    setRedoStack([]);
    setRetranscriptionRegion(null);
    setIsRetranscribingRegion(false);
  }

  function createHistoryEntry(
    nextDraftResult: JobResult,
    nextSelectedDraftNoteIds = stableSelectedDraftNoteIds,
    nextPrimarySelectedDraftNoteId = stablePrimarySelectedDraftNoteId
  ): DraftHistoryEntry {
    const selection = sanitizeSelectionState(nextDraftResult, nextSelectedDraftNoteIds, nextPrimarySelectedDraftNoteId);
    return {
      draftResult: nextDraftResult,
      selectedDraftNoteIds: selection.selectedDraftNoteIds,
      primarySelectedDraftNoteId: selection.primarySelectedDraftNoteId
    };
  }

  function restoreHistoryEntry(entry: DraftHistoryEntry): void {
    setDraftResult(entry.draftResult);
    setSelectedDraftNoteIds(entry.selectedDraftNoteIds);
    setPrimarySelectedDraftNoteId(entry.primarySelectedDraftNoteId);
  }

  function commitDraftResult(
    nextDraftResult: JobResult,
    nextSelectedDraftNoteIds = stableSelectedDraftNoteIds,
    nextPrimarySelectedDraftNoteId = stablePrimarySelectedDraftNoteId
  ): void {
    if (!draftResult || areJobResultsEqual(nextDraftResult, draftResult)) {
      const selection = draftResult
        ? sanitizeSelectionState(draftResult, nextSelectedDraftNoteIds, nextPrimarySelectedDraftNoteId)
        : { selectedDraftNoteIds: [], primarySelectedDraftNoteId: null };
      setSelectedDraftNoteIds(selection.selectedDraftNoteIds);
      setPrimarySelectedDraftNoteId(selection.primarySelectedDraftNoteId);
      return;
    }

    setUndoStack((current) => [...current, createHistoryEntry(draftResult)].slice(-MAX_HISTORY_ENTRIES));
    setRedoStack([]);

    const nextEntry = createHistoryEntry(nextDraftResult, nextSelectedDraftNoteIds, nextPrimarySelectedDraftNoteId);
    restoreHistoryEntry(nextEntry);
  }

  function clearSelection(): void {
    setSelectedDraftNoteIds([]);
    setPrimarySelectedDraftNoteId(null);
  }

  function clearRetranscriptionRegion(): void {
    setRetranscriptionRegion(null);
  }

  function selectDraftNote(draftNoteId: string, options?: SelectDraftNoteOptions): void {
    if (!activeResult) {
      return;
    }

    if (options?.additive) {
      const alreadySelected = stableSelectedDraftNoteIds.includes(draftNoteId);
      const nextSelectedDraftNoteIds = alreadySelected
        ? stableSelectedDraftNoteIds.filter((selectedDraftNoteId) => selectedDraftNoteId !== draftNoteId)
        : [...stableSelectedDraftNoteIds, draftNoteId];

      const nextPrimarySelectedDraftNoteId = alreadySelected ? nextSelectedDraftNoteIds[0] ?? null : draftNoteId;
      const selection = sanitizeSelectionState(activeResult, nextSelectedDraftNoteIds, nextPrimarySelectedDraftNoteId);
      setSelectedDraftNoteIds(selection.selectedDraftNoteIds);
      setPrimarySelectedDraftNoteId(selection.primarySelectedDraftNoteId);
      return;
    }

    const selection = sanitizeSelectionState(activeResult, [draftNoteId], draftNoteId);
    setSelectedDraftNoteIds(selection.selectedDraftNoteIds);
    setPrimarySelectedDraftNoteId(selection.primarySelectedDraftNoteId);
  }

  function replaceSelection(draftNoteIds: string[], options?: ReplaceSelectionOptions): void {
    if (!activeResult) {
      return;
    }

    const nextSelectedDraftNoteIds = options?.additive
      ? [...stableSelectedDraftNoteIds, ...draftNoteIds]
      : draftNoteIds;
    const nextPrimarySelectedDraftNoteId = options?.primaryDraftNoteId ?? draftNoteIds[0] ?? null;
    const selection = sanitizeSelectionState(activeResult, nextSelectedDraftNoteIds, nextPrimarySelectedDraftNoteId);
    setSelectedDraftNoteIds(selection.selectedDraftNoteIds);
    setPrimarySelectedDraftNoteId(selection.primarySelectedDraftNoteId);
  }

  function applyDraftUpdate(
    mutator: (draft: JobResult) => JobResult,
    options?: { selectedDraftNoteIds?: string[]; primarySelectedDraftNoteId?: string | null }
  ): void {
    if (!draftResult) {
      return;
    }

    const nextDraftResult = normalizeEditedResult(mutator(draftResult));
    commitDraftResult(
      nextDraftResult,
      options?.selectedDraftNoteIds ?? stableSelectedDraftNoteIds,
      options?.primarySelectedDraftNoteId ?? stablePrimarySelectedDraftNoteId
    );
  }

  function updateSelectedNote(mutator: (draft: JobResult, draftNoteId: string) => JobResult): void {
    if (!stablePrimarySelectedDraftNoteId) {
      return;
    }

    applyDraftUpdate((draft) => mutator(draft, stablePrimarySelectedDraftNoteId));
  }

  function addDraftNote(input: AddDraftNoteInput): void {
    if (!draftResult) {
      return;
    }

    const { draftResult: nextDraftResult, draftNoteId } = addNote(draftResult, input);
    commitDraftResult(nextDraftResult, [draftNoteId], draftNoteId);
  }

  function deleteSelectedNotes(): void {
    if (stableSelectedDraftNoteIds.length === 0) {
      return;
    }

    applyDraftUpdate((draft) => deleteNotes(draft, stableSelectedDraftNoteIds), {
      selectedDraftNoteIds: [],
      primarySelectedDraftNoteId: null
    });
  }

  function moveNote(draftNoteId: string, onsetSec: number): void {
    if (!draftResult) {
      return;
    }

    if (stableSelectedDraftNoteIds.length > 1 && stableSelectedDraftNoteIds.includes(draftNoteId)) {
      const anchorSelection = selectNote(draftResult, draftNoteId);
      if (!anchorSelection) {
        return;
      }

      const deltaSec = onsetSec - anchorSelection.note.onsetSec;
      applyDraftUpdate((draft) => moveNotesByDelta(draft, stableSelectedDraftNoteIds, deltaSec));
      return;
    }

    applyDraftUpdate((draft) => updateNoteTiming(draft, draftNoteId, onsetSec), {
      selectedDraftNoteIds: [draftNoteId],
      primarySelectedDraftNoteId: draftNoteId
    });
  }

  function changeSelectedDuration(durationSec: number): void {
    updateSelectedNote((draft, draftNoteId) => updateNoteDuration(draft, draftNoteId, durationSec));
  }

  function changeSelectedPitch(pitch: number): void {
    updateSelectedNote((draft, draftNoteId) => updateNotePitch(draft, draftNoteId, pitch));
  }

  function transposeSelectedPianoNotes(semitones: number): void {
    if (stableSelectedDraftNoteIds.length === 0) {
      return;
    }

    applyDraftUpdate((draft) => transposeNotes(draft, stableSelectedDraftNoteIds, semitones));
  }

  function quantizeSelection(subdivision: number): void {
    if (stableSelectedDraftNoteIds.length === 0) {
      return;
    }

    applyDraftUpdate((draft) => quantizeDraftNotes(draft, { draftNoteIds: stableSelectedDraftNoteIds, subdivision }));
  }

  function quantizeAllNotes(subdivision: number): void {
    applyDraftUpdate((draft) => quantizeDraftNotes(draft, { subdivision }));
  }

  function reassignSelectedDrumLane(drumLabel: string, midiNote?: number): void {
    if (stableSelectedDraftNoteIds.length === 0) {
      return;
    }

    applyDraftUpdate((draft) => reassignDrumLane(draft, stableSelectedDraftNoteIds, drumLabel, midiNote));
  }

  function undo(): void {
    if (undoStack.length === 0 || !draftResult) {
      return;
    }

    const previousEntry = undoStack[undoStack.length - 1];
    setUndoStack((current) => current.slice(0, -1));
    setRedoStack((current) => [...current, createHistoryEntry(draftResult)].slice(-MAX_HISTORY_ENTRIES));
    restoreHistoryEntry(previousEntry);
  }

  function redo(): void {
    if (redoStack.length === 0 || !draftResult) {
      return;
    }

    const nextEntry = redoStack[redoStack.length - 1];
    setRedoStack((current) => current.slice(0, -1));
    setUndoStack((current) => [...current, createHistoryEntry(draftResult)].slice(-MAX_HISTORY_ENTRIES));
    restoreHistoryEntry(nextEntry);
  }

  function selectAllNotes(): void {
    if (!activeResult) {
      return;
    }

    const allDraftNoteIds = activeResult.tracks.flatMap((track) =>
      track.notes.map((note) => note.draftNoteId).filter((draftNoteId): draftNoteId is string => Boolean(draftNoteId))
    );
    replaceSelection(allDraftNoteIds, { primaryDraftNoteId: allDraftNoteIds[0] ?? null });
  }

  function resetDraftFromOriginalResult(): void {
    if (!originalResult) {
      return;
    }

    commitDraftResult(resetDraftFromOriginal(originalResult), [], null);
  }

  function restoreSavedDraft(): void {
    if (!savedDraftResult) {
      return;
    }

    commitDraftResult(hydrateDraftResult(savedDraftResult), [], null);
  }

  function getCurrentDraftResult(): JobResult | undefined {
    return draftResult ? normalizeEditedResult(draftResult) : undefined;
  }

  async function retranscribeSelectedRegion(): Promise<void> {
    if (!jobId) {
      throw new Error("Complete a job before re-transcribing a region.");
    }
    if (!draftResult) {
      throw new Error("Draft result is not available yet.");
    }
    if (!retranscriptionRegion) {
      throw new Error("Select a region in the piano roll first.");
    }
    if (!retranscriptionRegion.instrument) {
      throw new Error("Select a region that belongs to either piano or drums before re-transcribing.");
    }

    setIsRetranscribingRegion(true);
    try {
      const response: RegionRetranscriptionResponse = await requestRegionRetranscription(jobId, {
        instrument: retranscriptionRegion.instrument,
        startSec: retranscriptionRegion.startSec,
        endSec: retranscriptionRegion.endSec
      });
      const replacement = replaceInstrumentRegionNotes(draftResult, {
        instrument: response.instrument,
        startSec: response.startSec,
        endSec: response.endSec,
        notes: response.notes
      });
      commitDraftResult(
        replacement.draftResult,
        replacement.insertedDraftNoteIds,
        replacement.insertedDraftNoteIds[0] ?? null
      );
    } finally {
      setIsRetranscribingRegion(false);
    }
  }

  function applySuggestion(suggestion: CorrectionSuggestion): void {
    if (!draftResult) {
      return;
    }

    const existing = selectNote(draftResult, suggestion.noteId);
    if (!existing) {
      return;
    }

    applyDraftUpdate(
      (draft) =>
        applyCorrectionSuggestion(draft, {
          draftNoteId: suggestion.noteId,
          suggestedChange: suggestion.suggestedChange
        }),
      {
        selectedDraftNoteIds: [suggestion.noteId],
        primarySelectedDraftNoteId: suggestion.noteId
      }
    );
  }

  return {
    draftResult,
    activeResult,
    isDraftDirty,
    hasSavedDraft,
    savedDraftVersion: savedDraftRecord?.version ?? null,
    savedDraftSavedAt: savedDraftRecord?.savedAt ?? null,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    selectedDraftNoteId: stablePrimarySelectedDraftNoteId,
    selectedDraftNoteIds: stableSelectedDraftNoteIds,
    selectedDraftNote,
    selectedDraftNotes,
    selectedTrack,
    selectedNote,
    selectedTrackKey,
    retranscriptionRegion,
    isRetranscribingRegion,
    selectDraftNote,
    replaceSelection,
    clearSelection,
    setRetranscriptionRegion,
    clearRetranscriptionRegion,
    clearEditableState,
    applyDraftUpdate,
    updateSelectedNote,
    addDraftNote,
    deleteSelectedNotes,
    moveNote,
    changeSelectedDuration,
    changeSelectedPitch,
    transposeSelectedPianoNotes,
    quantizeSelection,
    quantizeAllNotes,
    reassignSelectedDrumLane,
    undo,
    redo,
    selectAllNotes,
    resetDraftFromOriginalResult,
    restoreSavedDraft,
    getCurrentDraftResult
    ,
    retranscribeSelectedRegion,
    applySuggestion
  };
}
