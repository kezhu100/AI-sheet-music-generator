"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addNote,
  areJobResultsEqual,
  cloneJobResult,
  deleteNote,
  normalizeEditedResult,
  resetDraftFromOriginal,
  selectNote,
  updateNoteDuration,
  updateNotePitch,
  updateNoteTiming
} from "@ai-sheet-music-generator/music-engine";
import type { AddDraftNoteInput, SelectedDraftNote } from "@ai-sheet-music-generator/music-engine";
import type { JobDraftRecord, JobResult } from "@ai-sheet-music-generator/shared-types";

export interface EditableJobResultState {
  draftResult: JobResult | null;
  activeResult: JobResult | null;
  isDraftDirty: boolean;
  hasSavedDraft: boolean;
  savedDraftVersion: number | null;
  savedDraftSavedAt: string | null;
  selectedDraftNoteId: string | null;
  selectedDraftNote: SelectedDraftNote | null;
  selectedTrack: SelectedDraftNote["track"] | null;
  selectedNote: SelectedDraftNote["note"] | null;
  selectedTrackKey: string | null;
  setSelectedDraftNoteId: (draftNoteId: string | null) => void;
  clearEditableState: () => void;
  applyDraftUpdate: (mutator: (draft: JobResult) => JobResult) => void;
  updateSelectedNote: (mutator: (draft: JobResult, draftNoteId: string) => JobResult) => void;
  addDraftNote: (input: AddDraftNoteInput) => void;
  deleteSelectedNote: () => void;
  moveNote: (draftNoteId: string, onsetSec: number) => void;
  changeSelectedDuration: (durationSec: number) => void;
  changeSelectedPitch: (pitch: number) => void;
  resetDraftFromOriginalResult: () => void;
  restoreSavedDraft: () => void;
  getCurrentDraftResult: () => JobResult | undefined;
}

function hydrateDraftResult(result: JobResult): JobResult {
  return normalizeEditedResult(cloneJobResult(result));
}

export function useEditableJobResult(result: JobResult | null, savedDraft: JobDraftRecord | null): EditableJobResultState {
  const [originalResult, setOriginalResult] = useState<JobResult | null>(null);
  const [savedDraftRecord, setSavedDraftRecord] = useState<JobDraftRecord | null>(null);
  const [savedDraftResult, setSavedDraftResult] = useState<JobResult | null>(null);
  const [draftResult, setDraftResult] = useState<JobResult | null>(null);
  const [selectedDraftNoteId, setSelectedDraftNoteId] = useState<string | null>(null);

  useEffect(() => {
    if (!result) {
      setOriginalResult(null);
      setSavedDraftRecord(null);
      setSavedDraftResult(null);
      setDraftResult(null);
      setSelectedDraftNoteId(null);
      return;
    }

    const nextDraftResult = savedDraft ? hydrateDraftResult(savedDraft.result) : resetDraftFromOriginal(result);
    setOriginalResult(result);
    setSavedDraftRecord(savedDraft);
    setSavedDraftResult(savedDraft ? nextDraftResult : null);
    setDraftResult(nextDraftResult);
    setSelectedDraftNoteId(null);
  }, [result, savedDraft]);

  const activeResult = draftResult ?? result ?? null;
  const baselineDraftResult = savedDraftResult ?? (originalResult ? resetDraftFromOriginal(originalResult) : null);
  const isDraftDirty = useMemo(
    () => !areJobResultsEqual(draftResult, baselineDraftResult),
    [baselineDraftResult, draftResult]
  );
  const hasSavedDraft = savedDraftRecord != null;

  const selectedDraftNote = useMemo(() => {
    if (!activeResult || !selectedDraftNoteId) {
      return null;
    }

    return selectNote(activeResult, selectedDraftNoteId);
  }, [activeResult, selectedDraftNoteId]);

  const selectedTrack = selectedDraftNote?.track ?? null;
  const selectedNote = selectedDraftNote?.note ?? null;
  const selectedTrackKey = selectedDraftNote?.selection.trackKey ?? null;

  useEffect(() => {
    if (!selectedTrack || !selectedDraftNoteId) {
      return;
    }

    if (!selectedTrack.notes.some((note) => note.draftNoteId === selectedDraftNoteId)) {
      setSelectedDraftNoteId(null);
    }
  }, [selectedDraftNoteId, selectedTrack]);

  function clearEditableState(): void {
    setOriginalResult(null);
    setSavedDraftRecord(null);
    setSavedDraftResult(null);
    setDraftResult(null);
    setSelectedDraftNoteId(null);
  }

  function applyDraftUpdate(mutator: (draft: JobResult) => JobResult): void {
    setDraftResult((current) => {
      if (!current) {
        return current;
      }

      return normalizeEditedResult(mutator(current));
    });
  }

  function updateSelectedNote(mutator: (draft: JobResult, draftNoteId: string) => JobResult): void {
    if (!selectedDraftNoteId) {
      return;
    }

    applyDraftUpdate((draft) => mutator(draft, selectedDraftNoteId));
  }

  function addDraftNote(input: AddDraftNoteInput): void {
    if (!draftResult) {
      return;
    }

    const { draftResult: nextDraftResult, draftNoteId } = addNote(draftResult, input);
    setDraftResult(nextDraftResult);
    setSelectedDraftNoteId(draftNoteId);
  }

  function deleteSelectedNote(): void {
    if (!selectedDraftNoteId) {
      return;
    }

    applyDraftUpdate((draft) => deleteNote(draft, selectedDraftNoteId));
    setSelectedDraftNoteId(null);
  }

  function moveNote(draftNoteId: string, onsetSec: number): void {
    applyDraftUpdate((draft) => updateNoteTiming(draft, draftNoteId, onsetSec));
  }

  function changeSelectedDuration(durationSec: number): void {
    updateSelectedNote((draft, draftNoteId) => updateNoteDuration(draft, draftNoteId, durationSec));
  }

  function changeSelectedPitch(pitch: number): void {
    updateSelectedNote((draft, draftNoteId) => updateNotePitch(draft, draftNoteId, pitch));
  }

  function resetDraftFromOriginalResult(): void {
    if (!originalResult) {
      return;
    }

    setDraftResult(resetDraftFromOriginal(originalResult));
    setSelectedDraftNoteId(null);
  }

  function restoreSavedDraft(): void {
    if (!savedDraftResult) {
      return;
    }

    setDraftResult(hydrateDraftResult(savedDraftResult));
    setSelectedDraftNoteId(null);
  }

  function getCurrentDraftResult(): JobResult | undefined {
    return draftResult ? normalizeEditedResult(draftResult) : undefined;
  }

  return {
    draftResult,
    activeResult,
    isDraftDirty,
    hasSavedDraft,
    savedDraftVersion: savedDraftRecord?.version ?? null,
    savedDraftSavedAt: savedDraftRecord?.savedAt ?? null,
    selectedDraftNoteId,
    selectedDraftNote,
    selectedTrack,
    selectedNote,
    selectedTrackKey,
    setSelectedDraftNoteId,
    clearEditableState,
    applyDraftUpdate,
    updateSelectedNote,
    addDraftNote,
    deleteSelectedNote,
    moveNote,
    changeSelectedDuration,
    changeSelectedPitch,
    resetDraftFromOriginalResult,
    restoreSavedDraft,
    getCurrentDraftResult
  };
}
