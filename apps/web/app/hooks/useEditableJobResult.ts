"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addNote,
  deleteNote,
  normalizeEditedResult,
  resetDraftFromOriginal,
  selectNote,
  updateNoteDuration,
  updateNotePitch,
  updateNoteTiming
} from "@ai-sheet-music-generator/music-engine";
import type { AddDraftNoteInput, SelectedDraftNote } from "@ai-sheet-music-generator/music-engine";
import type { JobResult } from "@ai-sheet-music-generator/shared-types";

export interface EditableJobResultState {
  draftResult: JobResult | null;
  activeResult: JobResult | null;
  isDraftDirty: boolean;
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
  getExportResultOverride: () => JobResult | undefined;
}

export function useEditableJobResult(result: JobResult | null): EditableJobResultState {
  const [originalResult, setOriginalResult] = useState<JobResult | null>(null);
  const [draftResult, setDraftResult] = useState<JobResult | null>(null);
  const [isDraftDirty, setIsDraftDirty] = useState(false);
  const [selectedDraftNoteId, setSelectedDraftNoteId] = useState<string | null>(null);

  useEffect(() => {
    if (!result) {
      setOriginalResult(null);
      setDraftResult(null);
      setIsDraftDirty(false);
      setSelectedDraftNoteId(null);
      return;
    }

    setOriginalResult(result);
    setDraftResult(resetDraftFromOriginal(result));
    setIsDraftDirty(false);
    setSelectedDraftNoteId(null);
  }, [result]);

  const activeResult = draftResult ?? result ?? null;

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
    setDraftResult(null);
    setIsDraftDirty(false);
    setSelectedDraftNoteId(null);
  }

  function applyDraftUpdate(mutator: (draft: JobResult) => JobResult): void {
    setDraftResult((current) => {
      if (!current) {
        return current;
      }

      return mutator(current);
    });
    setIsDraftDirty(true);
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
    setIsDraftDirty(true);
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
    setIsDraftDirty(false);
    setSelectedDraftNoteId(null);
  }

  function getExportResultOverride(): JobResult | undefined {
    return isDraftDirty && draftResult ? normalizeEditedResult(draftResult) : undefined;
  }

  return {
    draftResult,
    activeResult,
    isDraftDirty,
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
    getExportResultOverride
  };
}
