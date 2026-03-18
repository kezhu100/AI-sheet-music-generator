"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  areJobResultsEqual,
  beatsToSeconds,
  buildPreviewTracks,
  formatEventTiming,
  getNoteDurationSec,
  getTrackKey,
  getVisibleTracks,
  summarizeJobResult,
  updateNoteTiming
} from "@ai-sheet-music-generator/music-engine";
import type {
  CorrectionSuggestion,
  JobDraftRecord,
  JobRecord,
  NoteEvent,
  ProjectDetail,
  UploadResponse
} from "@ai-sheet-music-generator/shared-types";
import {
  analyzeDraft,
  createJob,
  deleteProject,
  downloadMidiExport,
  downloadMusicXmlExport,
  duplicateProject,
  exportProjectToPath,
  getJob,
  getJobDraft,
  saveJobDraft,
  renameProject,
  uploadAudio
} from "../../lib/api";
import { getUiCopy } from "../../lib/uiCopy";
import { useEditableJobResult } from "../hooks/useEditableJobResult";
import { DrumNotationPreview } from "./DrumNotationPreview";
import { NoteEditorPanel } from "./NoteEditorPanel";
import { PianoRollPreview } from "./PianoRollPreview";
import { PianoScorePreview } from "./PianoScorePreview";
import { TrackVisibilityControls } from "./TrackVisibilityControls";

type WorkspaceMode = "home" | "project";

interface ProjectWorkspaceProps {
  mode: WorkspaceMode;
  initialProjectDetail?: ProjectDetail | null;
}

function formatNote(note: NoteEvent): string {
  if (note.instrument === "drums") {
    return `${note.drumLabel ?? "drum"} (${note.midiNote ?? "n/a"})`;
  }

  return `MIDI ${note.pitch ?? "n/a"}`;
}

function buildJobFromProjectDetail(projectDetail?: ProjectDetail | null): JobRecord | null {
  if (!projectDetail) {
    return null;
  }

  return {
    id: projectDetail.jobId,
    uploadId: projectDetail.upload?.uploadId ?? projectDetail.jobId,
    status: projectDetail.status,
    createdAt: projectDetail.createdAt,
    updatedAt: projectDetail.updatedAt,
    progress: {
      stage: projectDetail.currentStage ?? projectDetail.status,
      percent: projectDetail.status === "completed" || projectDetail.status === "failed" ? 100 : 0,
      message:
        projectDetail.statusMessage ??
        (projectDetail.status === "completed"
          ? "Completed project loaded from the local project library."
          : "Project metadata loaded from the local project library.")
    },
    result: projectDetail.originalResult ?? undefined,
    error: projectDetail.error ?? undefined
  };
}

function formatProjectAssetSummary(projectDetail: ProjectDetail): string {
  const labels: string[] = [];
  if (projectDetail.assets.hasSourceUpload) {
    labels.push("source upload");
  }
  if (projectDetail.assets.hasStems) {
    labels.push("stems");
  }
  if (projectDetail.assets.hasOriginalResult) {
    labels.push("original result");
  }
  if (projectDetail.hasSavedDraft) {
    labels.push(`draft v${projectDetail.draftVersion ?? 1}`);
  }
  if (projectDetail.assets.availableExports.length > 0) {
    labels.push(projectDetail.assets.availableExports.join(" + "));
  }
  if (projectDetail.trackCount != null) {
    labels.push(`${projectDetail.trackCount} tracks`);
  }
  if (projectDetail.stemCount != null) {
    labels.push(`${projectDetail.stemCount} stems`);
  }
  return labels.length > 0 ? labels.join(" | ") : "No persisted project assets yet.";
}

export function ProjectWorkspace({ mode, initialProjectDetail = null }: ProjectWorkspaceProps) {
  const router = useRouter();
  const copy = getUiCopy();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [upload, setUpload] = useState<UploadResponse | null>(null);
  const [job, setJob] = useState<JobRecord | null>(() => buildJobFromProjectDetail(initialProjectDetail));
  const [projectDetail, setProjectDetail] = useState<ProjectDetail | null>(initialProjectDetail);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isCreatingJob, setIsCreatingJob] = useState(false);
  const [isExportingOriginalMidi, setIsExportingOriginalMidi] = useState(false);
  const [isExportingDraftMidi, setIsExportingDraftMidi] = useState(false);
  const [isExportingOriginalMusicXml, setIsExportingOriginalMusicXml] = useState(false);
  const [isExportingDraftMusicXml, setIsExportingDraftMusicXml] = useState(false);
  const [savedDraft, setSavedDraft] = useState<JobDraftRecord | null>(initialProjectDetail?.savedDraft ?? null);
  const [isLoadingDraft, setIsLoadingDraft] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [suggestions, setSuggestions] = useState<CorrectionSuggestion[]>([]);
  const [isAnalyzingDraft, setIsAnalyzingDraft] = useState(false);
  const [suggestionsStale, setSuggestionsStale] = useState(false);
  const [lastAnalyzedDraftSignature, setLastAnalyzedDraftSignature] = useState<string | null>(null);
  const [visibleTrackKeys, setVisibleTrackKeys] = useState<string[]>([]);
  const [addTrackKey, setAddTrackKey] = useState("");
  const [addOnsetSec, setAddOnsetSec] = useState(0);
  const [addDurationSec, setAddDurationSec] = useState(0.5);
  const [addPitch, setAddPitch] = useState(60);
  const [addDrumLabel, setAddDrumLabel] = useState("snare");
  const [addDrumMidiNote, setAddDrumMidiNote] = useState(38);
  const [reassignDrumLabel, setReassignDrumLabel] = useState("snare");
  const [reassignDrumMidiNote, setReassignDrumMidiNote] = useState(38);
  const [isRenamingProject, setIsRenamingProject] = useState(false);
  const [isDuplicatingProject, setIsDuplicatingProject] = useState(false);
  const [isDeletingProject, setIsDeletingProject] = useState(false);
  const [isExportingProjectPackage, setIsExportingProjectPackage] = useState(false);
  const [exportSuccessMessage, setExportSuccessMessage] = useState<string | null>(null);
  const lastDraftJobIdRef = useRef<string | null>(null);

  const {
    draftResult,
    activeResult,
    isDraftDirty,
    hasSavedDraft,
    savedDraftVersion,
    savedDraftSavedAt,
    canUndo,
    canRedo,
    selectedDraftNoteId,
    selectedDraftNoteIds,
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
    clearEditableState,
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
    getCurrentDraftResult,
    retranscribeSelectedRegion,
    applySuggestion
  } = useEditableJobResult(job?.result ?? null, savedDraft, job?.id ?? null);

  useEffect(() => {
    setProjectDetail(initialProjectDetail);
    setJob(buildJobFromProjectDetail(initialProjectDetail));
    setSavedDraft(initialProjectDetail?.savedDraft ?? null);
    setSuggestions([]);
    setSuggestionsStale(false);
    setLastAnalyzedDraftSignature(null);
    lastDraftJobIdRef.current = null;
  }, [initialProjectDetail]);

  useEffect(() => {
    if (mode !== "home" || !job || job.status === "completed" || job.status === "failed") {
      return;
    }

    const intervalId = window.setInterval(async () => {
      try {
        const response = await getJob(job.id);
        setJob(response.job);
      } catch (pollError) {
        setError(pollError instanceof Error ? pollError.message : "Failed to poll job status.");
      }
    }, 1500);

    return () => window.clearInterval(intervalId);
  }, [job, mode]);

  useEffect(() => {
    if (!job?.result || job.status !== "completed") {
      setSavedDraft((currentDraft) => (mode === "project" ? currentDraft : null));
      lastDraftJobIdRef.current = null;
      return;
    }

    if (lastDraftJobIdRef.current === job.id || (mode === "project" && savedDraft != null)) {
      return;
    }

    let cancelled = false;
    lastDraftJobIdRef.current = job.id;
    setIsLoadingDraft(true);

    void (async () => {
      try {
        const response = await getJobDraft(job.id);
        if (!cancelled) {
          setSavedDraft(response.draft);
        }
      } catch (draftError) {
        if (!cancelled) {
          const message = draftError instanceof Error ? draftError.message : "Failed to load saved draft.";
          if (message !== "Draft not found.") {
            setError(message);
          }
          if (mode !== "project") {
            setSavedDraft(null);
          }
        }
      } finally {
        if (!cancelled) {
          setIsLoadingDraft(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [job?.id, job?.result, job?.status, mode, savedDraft]);

  useEffect(() => {
    if (!activeResult) {
      setAddTrackKey("");
      return;
    }

    setAddTrackKey((currentTrackKey) => currentTrackKey || (activeResult.tracks[0] ? getTrackKey(activeResult.tracks[0]) : ""));
  }, [activeResult]);

  const trackSummaries = useMemo(() => {
    if (!activeResult) {
      return [];
    }

    return summarizeJobResult(activeResult);
  }, [activeResult]);

  const previewTracks = useMemo(() => {
    return activeResult ? buildPreviewTracks(activeResult.tracks) : [];
  }, [activeResult]);

  useEffect(() => {
    if (!previewTracks.length) {
      setVisibleTrackKeys([]);
      return;
    }

    setVisibleTrackKeys((currentKeys) => {
      if (currentKeys.length === 0) {
        return previewTracks.map((track) => track.key);
      }

      const validTrackKeys = new Set(previewTracks.map((track) => track.key));
      const nextKeys = currentKeys.filter((trackKey) => validTrackKeys.has(trackKey));

      return nextKeys.length > 0 ? nextKeys : previewTracks.map((track) => track.key);
    });
  }, [previewTracks]);

  const visibleTracks = useMemo(() => {
    return activeResult ? getVisibleTracks(activeResult.tracks, visibleTrackKeys) : [];
  }, [activeResult, visibleTrackKeys]);

  const pianoTrack = useMemo(() => {
    return visibleTracks.find((track) => track.instrument === "piano") ?? null;
  }, [visibleTracks]);

  const drumTrack = useMemo(() => {
    return visibleTracks.find((track) => track.instrument === "drums") ?? null;
  }, [visibleTracks]);

  useEffect(() => {
    if (!selectedNote) {
      return;
    }

    setAddOnsetSec(selectedNote.onsetSec);
    setAddDurationSec(getNoteDurationSec(selectedNote, activeResult?.bpm ?? 120));
    if (selectedTrackKey) {
      setAddTrackKey(selectedTrackKey);
    }
    if (selectedNote.pitch != null) {
      setAddPitch(selectedNote.pitch);
    }
    if (selectedNote.drumLabel) {
      setAddDrumLabel(selectedNote.drumLabel);
    }
    if (selectedNote.midiNote != null) {
      setAddDrumMidiNote(selectedNote.midiNote);
    }
    if (selectedNote.instrument === "drums") {
      setReassignDrumLabel(selectedNote.drumLabel ?? "snare");
      setReassignDrumMidiNote(selectedNote.midiNote ?? 38);
    }
  }, [activeResult?.bpm, selectedNote, selectedTrackKey]);

  useEffect(() => {
    const selectedDrumNotes = selectedDraftNotes.filter((note) => note.note.instrument === "drums");
    if (selectedDrumNotes.length === 0) {
      return;
    }

    setReassignDrumLabel(selectedDrumNotes[0].note.drumLabel ?? "snare");
    setReassignDrumMidiNote(selectedDrumNotes[0].note.midiNote ?? 38);
  }, [selectedDraftNotes]);

  useEffect(() => {
    if (!activeResult || activeResult.tracks.length === 0) {
      return;
    }

    const validTrackKeys = new Set(activeResult.tracks.map((track) => getTrackKey(track)));
    if (!validTrackKeys.has(addTrackKey)) {
      setAddTrackKey(getTrackKey(activeResult.tracks[0]));
    }
  }, [activeResult, addTrackKey]);

  const draftMatchesOriginal = useMemo(() => {
    return areJobResultsEqual(activeResult, job?.result ?? null);
  }, [activeResult, job?.result]);
  const downloadBaseName =
    projectDetail?.projectName ?? activeResult?.projectName ?? job?.result?.projectName ?? "ai-sheet-music-generator";

  useEffect(() => {
    if (!activeResult) {
      setSuggestions([]);
      setSuggestionsStale(false);
      setLastAnalyzedDraftSignature(null);
      return;
    }

    const currentDraftSignature = JSON.stringify(activeResult);
    if (lastAnalyzedDraftSignature && currentDraftSignature !== lastAnalyzedDraftSignature) {
      setSuggestions([]);
      setSuggestionsStale(true);
      setLastAnalyzedDraftSignature(null);
      return;
    }

    const availableNoteIds = new Set(
      activeResult.tracks.flatMap((track) =>
        track.notes.map((note) => note.draftNoteId).filter((draftNoteId): draftNoteId is string => Boolean(draftNoteId))
      )
    );
    setSuggestions((currentSuggestions) =>
      currentSuggestions.filter((suggestion) => availableNoteIds.has(suggestion.noteId))
    );
  }, [activeResult, lastAnalyzedDraftSignature]);

  useEffect(() => {
    if (!activeResult) {
      return;
    }

    const activeBpm = activeResult.bpm;

    function targetIsEditable(eventTarget: EventTarget | null): boolean {
      if (!(eventTarget instanceof HTMLElement)) {
        return false;
      }

      const tagName = eventTarget.tagName.toLowerCase();
      return tagName === "input" || tagName === "textarea" || tagName === "select" || eventTarget.isContentEditable;
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (targetIsEditable(event.target)) {
        return;
      }

      const hasSelection = selectedDraftNoteIds.length > 0;
      const isMetaShortcut = event.metaKey || event.ctrlKey;
      const nudgeSec = beatsToSeconds(0.25, activeBpm);

      if (isMetaShortcut && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
        return;
      }

      if (isMetaShortcut && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
        return;
      }

      if (isMetaShortcut && event.key.toLowerCase() === "a") {
        event.preventDefault();
        selectAllNotes();
        return;
      }

      if (event.key.toLowerCase() === "q" && hasSelection) {
        event.preventDefault();
        quantizeSelection(4);
        return;
      }

      if ((event.key === "Delete" || event.key === "Backspace") && hasSelection) {
        event.preventDefault();
        deleteSelectedNotes();
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        clearSelection();
        return;
      }

      if (event.key === "ArrowLeft" && selectedDraftNoteId) {
        event.preventDefault();
        const anchor = selectedDraftNotes.find((selected) => selected.selection.draftNoteId === selectedDraftNoteId);
        if (anchor) {
          moveNote(selectedDraftNoteId, Math.max(0, anchor.note.onsetSec - nudgeSec));
        }
        return;
      }

      if (event.key === "ArrowRight" && selectedDraftNoteId) {
        event.preventDefault();
        const anchor = selectedDraftNotes.find((selected) => selected.selection.draftNoteId === selectedDraftNoteId);
        if (anchor) {
          moveNote(selectedDraftNoteId, anchor.note.onsetSec + nudgeSec);
        }
        return;
      }

      if (event.key === "ArrowUp" && hasSelection && selectedDraftNotes.every((selected) => selected.note.instrument === "piano")) {
        event.preventDefault();
        transposeSelectedPianoNotes(1);
        return;
      }

      if (event.key === "ArrowDown" && hasSelection && selectedDraftNotes.every((selected) => selected.note.instrument === "piano")) {
        event.preventDefault();
        transposeSelectedPianoNotes(-1);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    activeResult,
    clearSelection,
    deleteSelectedNotes,
    moveNote,
    quantizeSelection,
    redo,
    selectAllNotes,
    selectedDraftNoteId,
    selectedDraftNoteIds.length,
    selectedDraftNotes,
    transposeSelectedPianoNotes,
    undo
  ]);

  async function handleUploadAndCreateJob(): Promise<void> {
    if (!selectedFile) {
      setError("Choose an audio file first.");
      return;
    }

    setError(null);
    setIsUploading(true);
    setUpload(null);
    setJob(null);
    setProjectDetail(null);
    setSavedDraft(null);
    setSuggestions([]);
    setSuggestionsStale(false);
    setLastAnalyzedDraftSignature(null);
    lastDraftJobIdRef.current = null;
    clearEditableState();

    try {
      const uploadResponse = await uploadAudio(selectedFile);
      setUpload(uploadResponse);
      setIsUploading(false);
      setIsCreatingJob(true);
      const jobResponse = await createJob({ uploadId: uploadResponse.upload.uploadId });
      setJob(jobResponse.job);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Upload failed.");
    } finally {
      setIsUploading(false);
      setIsCreatingJob(false);
    }
  }

  async function handleMidiExport(modeName: "original" | "draft"): Promise<void> {
    if (!job?.result) {
      setError("Complete a job before exporting MIDI.");
      return;
    }

    if (modeName === "draft" && !activeResult) {
      setError("Draft result is not available yet.");
      return;
    }

    setError(null);
    if (modeName === "original") {
      setIsExportingOriginalMidi(true);
    } else {
      setIsExportingDraftMidi(true);
    }

    try {
      const midiBlob = await downloadMidiExport(job.id, modeName === "draft" ? getCurrentDraftResult() : undefined);
      const url = window.URL.createObjectURL(midiBlob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${downloadBaseName}-${modeName}.mid`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Failed to export MIDI.");
    } finally {
      if (modeName === "original") {
        setIsExportingOriginalMidi(false);
      } else {
        setIsExportingDraftMidi(false);
      }
    }
  }

  async function handleMusicXmlExport(modeName: "original" | "draft"): Promise<void> {
    if (!job?.result) {
      setError("Complete a job before exporting MusicXML.");
      return;
    }

    if (modeName === "draft" && !activeResult) {
      setError("Draft result is not available yet.");
      return;
    }

    setError(null);
    if (modeName === "original") {
      setIsExportingOriginalMusicXml(true);
    } else {
      setIsExportingDraftMusicXml(true);
    }

    try {
      const musicXmlBlob = await downloadMusicXmlExport(job.id, modeName === "draft" ? getCurrentDraftResult() : undefined);
      const url = window.URL.createObjectURL(musicXmlBlob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${downloadBaseName}-${modeName}.musicxml`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Failed to export MusicXML.");
    } finally {
      if (modeName === "original") {
        setIsExportingOriginalMusicXml(false);
      } else {
        setIsExportingDraftMusicXml(false);
      }
    }
  }

  async function handleSaveDraft(): Promise<void> {
    if (!job?.result) {
      setError("Complete a job before saving a draft.");
      return;
    }

    const currentDraft = getCurrentDraftResult();
    if (!currentDraft) {
      setError("Draft result is not available yet.");
      return;
    }

    setError(null);
    setIsSavingDraft(true);

    try {
      const response = await saveJobDraft(job.id, currentDraft);
      setSavedDraft(response.draft);
      setProjectDetail((currentProject) =>
        currentProject
          ? {
              ...currentProject,
              hasSavedDraft: true,
              draftVersion: response.draft.version,
              draftSavedAt: response.draft.savedAt,
              savedDraft: response.draft,
              updatedAt: response.draft.savedAt
            }
          : currentProject
      );
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save draft.");
    } finally {
      setIsSavingDraft(false);
    }
  }

  async function handleAnalyzeDraft(): Promise<void> {
    if (!job?.id) {
      setError("Complete a job before analyzing the draft.");
      return;
    }

    const currentDraft = getCurrentDraftResult();
    if (!currentDraft) {
      setError("Draft result is not available yet.");
      return;
    }

    setError(null);
    setIsAnalyzingDraft(true);

    try {
      const response = await analyzeDraft(job.id, currentDraft);
      setSuggestions(response.suggestions);
      setSuggestionsStale(false);
      setLastAnalyzedDraftSignature(JSON.stringify(currentDraft));
    } catch (analysisError) {
      setError(analysisError instanceof Error ? analysisError.message : "Failed to analyze the draft.");
    } finally {
      setIsAnalyzingDraft(false);
    }
  }

  function toggleTrackVisibility(trackKey: string): void {
    setVisibleTrackKeys((currentKeys) =>
      currentKeys.includes(trackKey) ? currentKeys.filter((key) => key !== trackKey) : [...currentKeys, trackKey]
    );
  }

  function handleSelectNote(_trackKey: string, draftNoteId: string, options?: { additive?: boolean }): void {
    selectDraftNote(draftNoteId, options);
  }

  function handleBoxSelect(noteIds: string[], options?: { additive?: boolean }): void {
    replaceSelection(noteIds, { additive: options?.additive, primaryDraftNoteId: noteIds[0] ?? null });
  }

  function handleMoveNote(_trackKey: string, draftNoteId: string, onsetSec: number): void {
    moveNote(draftNoteId, onsetSec);
  }

  function handleDeleteSelectedNotes(): void {
    deleteSelectedNotes();
  }

  function handleAddNote(): void {
    if (!draftResult) {
      return;
    }

    const track = draftResult.tracks.find((candidate) => getTrackKey(candidate) === addTrackKey);
    if (!track) {
      setError("Choose a track before adding a note.");
      return;
    }

    addDraftNote({
      trackKey: addTrackKey,
      instrument: track.instrument,
      sourceStem: track.sourceStem,
      onsetSec: addOnsetSec,
      durationSec: addDurationSec,
      pitch: addPitch,
      drumLabel: addDrumLabel,
      midiNote: addDrumMidiNote
    });
  }

  function handleReassignSelectedDrumLane(): void {
    reassignSelectedDrumLane(reassignDrumLabel, reassignDrumMidiNote);
  }

  async function handleRetranscribeRegion(): Promise<void> {
    try {
      setError(null);
      await retranscribeSelectedRegion();
    } catch (retranscriptionError) {
      setError(
        retranscriptionError instanceof Error
          ? retranscriptionError.message
          : "Failed to re-transcribe the selected region."
      );
    }
  }

  function handleApplySuggestion(suggestion: CorrectionSuggestion): void {
    applySuggestion(suggestion);
    setSuggestions((currentSuggestions) =>
      currentSuggestions.filter((currentSuggestion) => currentSuggestion.noteId !== suggestion.noteId)
    );
    setSuggestionsStale(true);
    setLastAnalyzedDraftSignature(null);
  }

  async function handleCopyProjectLink(): Promise<void> {
    if (!projectDetail) {
      return;
    }

    const shareUrl = `${window.location.origin}${projectDetail.sharePath}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch (copyError) {
      setError(copyError instanceof Error ? copyError.message : "Failed to copy the project link.");
    }
  }

  async function handleRenameProject(): Promise<void> {
    if (!projectDetail) {
      return;
    }

    const nextName = window.prompt("Rename project", projectDetail.projectName)?.trim();
    if (!nextName || nextName === projectDetail.projectName) {
      return;
    }

    setIsRenamingProject(true);
    setError(null);
    try {
      const response = await renameProject(projectDetail.projectId, nextName);
      setProjectDetail(response.project);
      setJob(buildJobFromProjectDetail(response.project));
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : "Failed to rename the project.");
    } finally {
      setIsRenamingProject(false);
    }
  }

  async function handleDuplicateProject(): Promise<void> {
    if (!projectDetail) {
      return;
    }

    const nextName = window.prompt("Duplicate project as", `${projectDetail.projectName} copy`)?.trim();
    if (nextName === "") {
      return;
    }

    setIsDuplicatingProject(true);
    setError(null);
    try {
      const response = await duplicateProject(projectDetail.projectId, nextName || undefined);
      router.push(response.project.sharePath);
    } catch (duplicateError) {
      setError(duplicateError instanceof Error ? duplicateError.message : "Failed to duplicate the project.");
    } finally {
      setIsDuplicatingProject(false);
    }
  }

  async function handleDeleteProject(): Promise<void> {
    if (!projectDetail) {
      return;
    }

    const confirmed = window.confirm(`Delete "${projectDetail.projectName}" and its saved draft?`);
    if (!confirmed) {
      return;
    }

    setIsDeletingProject(true);
    setError(null);
    try {
      await deleteProject(projectDetail.projectId);
      router.push("/projects");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete the project.");
    } finally {
      setIsDeletingProject(false);
    }
  }

  async function handleExportProjectPackage(): Promise<void> {
    if (!projectDetail) {
      return;
    }

    const defaultTargetPath = `${projectDetail.projectName.replace(/[\\/:*?"<>|]+/g, "_") || "project"}.aismp.zip`;
    const targetPath = window.prompt("Export project package to local path", defaultTargetPath)?.trim();
    if (!targetPath) {
      return;
    }

    setIsExportingProjectPackage(true);
    setError(null);
    setExportSuccessMessage(null);
    try {
      const response = await exportProjectToPath(projectDetail.projectId, targetPath);
      setProjectDetail(response.project);
      const savedPath = response.savedPath ?? targetPath;
      setExportSuccessMessage(`Project exported successfully.\nSaved to: ${savedPath}`);
    } catch (actionError) {
      const message = actionError instanceof Error ? actionError.message : "Export failed. Please check the path and try again.";
      setError(mapProjectExportError(message));
    } finally {
      setIsExportingProjectPackage(false);
    }
  }

  function mapProjectExportError(message: string): string {
    const normalizedMessage = message.toLowerCase();
    if (normalizedMessage.includes("already exists")) {
      return "File already exists. Please choose a different name.";
    }
    if (normalizedMessage.includes("target directory does not exist")) {
      return "Target directory does not exist.";
    }
    if (normalizedMessage.includes("permission denied")) {
      return "Permission denied. Cannot write to the specified path.";
    }
    return "Export failed. Please check the path and try again.";
  }

  return (
    <main className="page">
      <section className="hero">
        <div className="top-nav">
          <Link className="button secondary" href={mode === "home" ? "/projects" : "/"}>
            {mode === "home" ? "Open project library" : "Back to upload"}
          </Link>
          <Link className="button secondary" href={mode === "project" ? "/projects" : "/"}>
            {mode === "project" ? "Back to library" : "Stay on upload"}
          </Link>
        </div>
        <div className="hero-grid">
          <div>
            <h1>{mode === "home" ? "AI Sheet Music Generator" : projectDetail?.projectName ?? "Project workspace"}</h1>
            <p>
              Upload audio, generate editable draft notation for piano and drums, save the latest draft separately from
              the original result, and reopen projects from a local library without pretending the AI output is perfect.
            </p>
            <div className="pill-row">
              <span className="pill">Editable draft output</span>
              <span className="pill">Save latest draft</span>
              <span className="pill">MIDI + MusicXML export</span>
              <span className="pill">Region re-transcription</span>
              <span className="pill">Draft analysis suggestions</span>
              <span className="pill">Stable local project routes</span>
              {mode === "project" ? (
                <span className={`pill ${isDraftDirty ? "pill-warning" : "pill-success"}`}>
                  {isDraftDirty ? copy.project.unsavedChanges : copy.project.savedDraft}
                </span>
              ) : null}
            </div>
          </div>
          <div className="panel inset-panel">
            <h3>First-run guidance</h3>
            <div className="note-list">
              <article className="note-card">
                <strong>Best inputs</strong>
                <div className="muted">Clear stems or simple mixed songs work best. Piano and drums are the only serious targets today.</div>
              </article>
              <article className="note-card">
                <strong>Draft-first product</strong>
                <div className="muted">Generated notation is an editable draft. Save your edited draft explicitly when you want it to appear in the project library.</div>
              </article>
              <article className="note-card">
                <strong>Editing workflow</strong>
                <div className="muted">Use region re-transcription, suggestion analysis, quantize tools, and draft export without mutating the original completed backend result.</div>
              </article>
            </div>
          </div>
        </div>
      </section>
      {mode === "home" ? (
        <section className="content-grid">
          <div className="panel">
            <h2>Upload Flow</h2>
            <div className="upload-form">
              <div className="upload-box">
                <label htmlFor="audio-file">Audio file</label>
                <input
                  id="audio-file"
                  type="file"
                  accept="audio/*"
                  onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
                />
                <p className="muted">Mixed songs and isolated stems both route through the same provider-based pipeline.</p>
              </div>
              <div className="actions">
                <button
                  className="button"
                  type="button"
                  disabled={isUploading || isCreatingJob || !selectedFile}
                  onClick={handleUploadAndCreateJob}
                >
                  {isUploading ? "Uploading..." : isCreatingJob ? "Creating job..." : "Upload and process"}
                </button>
                <Link className="button secondary" href="/projects">
                  Browse local library
                </Link>
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => {
                    setSelectedFile(null);
                    setUpload(null);
                    setJob(null);
                    setProjectDetail(null);
                    setSavedDraft(null);
                    setSuggestions([]);
                    setSuggestionsStale(false);
                    setLastAnalyzedDraftSignature(null);
                    lastDraftJobIdRef.current = null;
                    clearEditableState();
                    setError(null);
                  }}
                >
                  Reset
                </button>
              </div>
              {job?.result ? (
                <p className="muted">
                  {isLoadingDraft
                    ? "Checking for a saved draft..."
                    : hasSavedDraft
                      ? `Saved draft v${savedDraftVersion ?? 1} is loaded separately from the original result.`
                      : "No saved draft found yet. Draft export uses the current editor state."}
                </p>
              ) : (
                <p className="muted">
                  Phase 12 adds a local project library view. Completed jobs now become reopenable project entries when they are created.
                </p>
              )}
            </div>

            {error ? <p className="error">{error}</p> : null}

            <div className="meta-list">
              {selectedFile ? (
                <div className="meta-item">
                  <strong>Selected file</strong>
                  <div>{selectedFile.name}</div>
                  <div className="muted">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</div>
                </div>
              ) : null}
              {upload ? (
                <div className="meta-item">
                  <strong>Upload stored</strong>
                  <div>{upload.upload.fileName}</div>
                  <div className="muted">{upload.upload.storedPath}</div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="panel">
            <h2>Job Status</h2>
            {job ? (
              <>
                <div className="status-bar" aria-hidden="true">
                  <div className="status-fill" style={{ width: `${job.progress.percent}%` }} />
                </div>
                <p className="status-text">
                  <strong>{job.status}</strong> | {job.progress.stage} | {job.progress.percent}%
                </p>
                <p className="muted">{job.progress.message}</p>
                <div className="meta-list">
                  <div className="meta-item">
                    <strong>Job ID</strong>
                    <div>{job.id}</div>
                  </div>
                  <div className="meta-item">
                    <strong>Updated</strong>
                    <div>{new Date(job.updatedAt).toLocaleString()}</div>
                  </div>
                </div>
              </>
            ) : (
              <p className="muted">Create a job to start polling status.</p>
            )}
          </div>
        </section>
      ) : (
        <section className="content-grid">
          <div className="panel">
            <h2>Project Overview</h2>
            {projectDetail ? (
              <div className="meta-list">
                <div className="meta-item">
                  <strong>Status</strong>
                  <div>{projectDetail.status}</div>
                  <div className="muted">{projectDetail.statusMessage ?? "Local manifest-backed project metadata."}</div>
                </div>
                <div className="meta-item">
                  <strong>Assets</strong>
                  <div>{formatProjectAssetSummary(projectDetail)}</div>
                  <div className="muted">Share route: {projectDetail.sharePath}</div>
                </div>
                <div className="meta-item">
                  <strong>Draft baseline</strong>
                  <div>
                    {projectDetail.hasSavedDraft
                      ? `Saved draft v${projectDetail.draftVersion ?? 1}${projectDetail.draftSavedAt ? ` on ${new Date(projectDetail.draftSavedAt).toLocaleString()}` : ""}`
                      : "No saved draft yet"}
                  </div>
                  <div className="muted">
                    {isDraftDirty
                      ? "Current in-session changes are not saved yet."
                      : "Current editor state matches the last saved baseline or the original result."}
                  </div>
                </div>
                {projectDetail.upload ? (
                  <div className="meta-item">
                    <strong>Source upload</strong>
                    <div>{projectDetail.upload.fileName}</div>
                    <div className="muted">{projectDetail.upload.storedPath}</div>
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="muted">Project metadata is not available.</p>
            )}
          </div>
          <div className="panel">
            <h2>{copy.project.projectSettings}</h2>
            {projectDetail ? (
              <>
                <p className="muted">{copy.project.localRouteNotice}</p>
                <div className="actions">
                  <button className="button secondary" type="button" onClick={() => void handleCopyProjectLink()}>
                    {copy.project.copyLinkAction}
                  </button>
                  <Link className="button secondary" href={projectDetail.sharePath}>
                    Open stable route
                  </Link>
                </div>
                <div className="actions">
                  <button
                    className="button secondary"
                    disabled={isRenamingProject || isDuplicatingProject || isDeletingProject || isExportingProjectPackage}
                    onClick={() => void handleExportProjectPackage()}
                    type="button"
                  >
                    {isExportingProjectPackage ? "Exporting package..." : "Export project package"}
                  </button>
                  <button
                    className="button secondary"
                    disabled={isRenamingProject || isDuplicatingProject || isDeletingProject}
                    onClick={() => void handleRenameProject()}
                    type="button"
                  >
                    {copy.project.renameAction}
                  </button>
                  <button
                    className="button secondary"
                    disabled={isRenamingProject || isDuplicatingProject || isDeletingProject}
                    onClick={() => void handleDuplicateProject()}
                    type="button"
                  >
                    {copy.project.duplicateAction}
                  </button>
                  <button
                    className="button secondary danger-button"
                    disabled={isRenamingProject || isDuplicatingProject || isDeletingProject}
                    onClick={() => void handleDeleteProject()}
                    type="button"
                  >
                    {copy.project.deleteAction}
                  </button>
                </div>
              </>
            ) : (
              <p className="muted">No share route is available for this project.</p>
            )}
          </div>
        </section>
      )}

      {error ? <p className="error">{error}</p> : null}
      {exportSuccessMessage ? (
        <section className="panel">
          <h2>Project Export</h2>
          <p style={{ whiteSpace: "pre-wrap" }}>{exportSuccessMessage}</p>
        </section>
      ) : null}
      {activeResult ? (
        <>
          <section className="panel workspace-banner">
            <div>
              <strong>{isDraftDirty ? copy.project.unsavedChanges : copy.project.savedDraft}</strong>
              <div className="muted">
                {draftMatchesOriginal
                  ? "The current draft still matches the original completed result."
                  : isDraftDirty
                    ? "The current draft differs from the last saved baseline. Save draft when you want these edits persisted."
                    : "The current draft matches the latest saved draft and stays separate from the immutable original result."}
              </div>
            </div>
            <div className="actions">
              <button className="button" type="button" disabled={!activeResult || isSavingDraft} onClick={() => void handleSaveDraft()}>
                {isSavingDraft ? "Saving draft..." : "Save draft"}
              </button>
              {mode === "project" ? (
                <button className="button secondary" type="button" onClick={() => void handleRenameProject()}>
                  {copy.project.renameAction}
                </button>
              ) : null}
            </div>
          </section>
          <section className="content-grid">
            <div className="panel">
              <h2>Track Summary</h2>
              <p className="muted">Estimated tempo: {activeResult.bpm} BPM</p>
              <div className="track-list">
                {trackSummaries.map((track) => (
                  <article className="track-card" key={`${track.instrument}-${track.sourceStem}`}>
                    <strong>
                      {track.instrument} | {track.sourceStem}
                    </strong>
                    <div className="muted">Provider: {track.provider}</div>
                    <div>{track.eventCount} note events</div>
                    <div>Average confidence: {track.avgConfidence}</div>
                  </article>
                ))}
              </div>
            </div>

            <div className="panel">
              <h2>Generated Stems</h2>
              <div className="track-list">
                {activeResult.stems.map((stem) => (
                  <article className="track-card" key={stem.stemName}>
                    <strong>
                      {stem.instrumentHint} - {stem.stemName}
                    </strong>
                    <div className="muted">Provider: {stem.provider}</div>
                    <div>{stem.fileName}</div>
                    <div className="muted">{stem.storedPath}</div>
                    <div className="muted">
                      {stem.fileFormat.toUpperCase()} - {(stem.sizeBytes / 1024).toFixed(1)} KB
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section className="content-grid">
            <div className="panel">
              <h2>Export and Draft Actions</h2>
              <div className="actions">
                {mode === "project" ? (
                  <button
                    className="button secondary"
                    type="button"
                    disabled={!projectDetail || isExportingProjectPackage}
                    onClick={() => void handleExportProjectPackage()}
                  >
                    {isExportingProjectPackage ? "Exporting package..." : "Export project package"}
                  </button>
                ) : null}
                <button
                  className="button secondary"
                  type="button"
                  disabled={!job?.result || isExportingOriginalMidi}
                  onClick={() => void handleMidiExport("original")}
                >
                  {isExportingOriginalMidi ? "Exporting original MIDI..." : "Download original MIDI"}
                </button>
                <button
                  className="button secondary"
                  type="button"
                  disabled={!activeResult || isExportingDraftMidi}
                  onClick={() => void handleMidiExport("draft")}
                >
                  {isExportingDraftMidi ? "Exporting draft MIDI..." : "Download draft MIDI"}
                </button>
                <button
                  className="button secondary"
                  type="button"
                  disabled={!job?.result || isExportingOriginalMusicXml}
                  onClick={() => void handleMusicXmlExport("original")}
                >
                  {isExportingOriginalMusicXml ? "Exporting original MusicXML..." : "Download original MusicXML"}
                </button>
                <button
                  className="button secondary"
                  type="button"
                  disabled={!activeResult || isExportingDraftMusicXml}
                  onClick={() => void handleMusicXmlExport("draft")}
                >
                  {isExportingDraftMusicXml ? "Exporting draft MusicXML..." : "Download draft MusicXML"}
                </button>
                <button className="button" type="button" disabled={!activeResult || isSavingDraft} onClick={() => void handleSaveDraft()}>
                  {isSavingDraft ? "Saving draft..." : "Save draft"}
                </button>
              </div>
              <p className="muted">
                Original export uses the completed backend result. Draft export uses the current editable draft, whether it came from a saved draft or new local changes.
              </p>
            </div>

            <div className="panel">
              <h2>Track Visibility</h2>
              <TrackVisibilityControls
                onHideAllTracks={() => setVisibleTrackKeys([])}
                onShowAllTracks={() => setVisibleTrackKeys(previewTracks.map((track) => track.key))}
                onToggleTrack={toggleTrackVisibility}
                tracks={previewTracks}
                visibleTrackKeys={visibleTrackKeys}
              />
            </div>
          </section>

          <section className="content-grid preview-layout">
            <div className="panel">
              <h2>Piano-Roll Preview</h2>
              <p className="muted">Select, Ctrl/Cmd-add, or box-select notes here, then drag horizontally to move timing.</p>
              <PianoRollPreview
                bpm={activeResult.bpm}
                onBoxSelect={handleBoxSelect}
                onClearSelection={clearSelection}
                onMoveNote={handleMoveNote}
                onSelectRegion={setRetranscriptionRegion}
                onSelectNote={handleSelectNote}
                selectedRegion={retranscriptionRegion}
                selectedNoteId={selectedDraftNoteId}
                selectedNoteIds={selectedDraftNoteIds}
                suggestedNoteIds={suggestions.map((suggestion) => suggestion.noteId)}
                selectedTrackKey={selectedTrackKey}
                tracks={visibleTracks}
              />
            </div>
          </section>
          <section className="content-grid">
            <div className="panel">
              <h2>Editing Draft</h2>
              <NoteEditorPanel
                addDrumLabel={addDrumLabel}
                addDrumMidiNote={addDrumMidiNote}
                addDurationSec={addDurationSec}
                addOnsetSec={addOnsetSec}
                addPitch={addPitch}
                addTrackKey={addTrackKey}
                draftResult={activeResult}
                hasDraftChanges={isDraftDirty}
                hasSavedDraft={hasSavedDraft}
                savedDraftVersion={savedDraftVersion}
                savedDraftSavedAt={savedDraftSavedAt}
                isSavingDraft={isSavingDraft}
                canUndo={canUndo}
                canRedo={canRedo}
                suggestions={suggestions}
                isAnalyzingDraft={isAnalyzingDraft}
                suggestionsStale={suggestionsStale}
                retranscriptionRegion={retranscriptionRegion}
                isRetranscribingRegion={isRetranscribingRegion}
                onAddNote={handleAddNote}
                onChangeAddDrumLabel={setAddDrumLabel}
                onChangeAddDrumMidiNote={setAddDrumMidiNote}
                onChangeAddDurationSec={setAddDurationSec}
                onChangeAddOnsetSec={setAddOnsetSec}
                onChangeAddPitch={setAddPitch}
                onChangeReassignDrumLabel={setReassignDrumLabel}
                onChangeReassignDrumMidiNote={setReassignDrumMidiNote}
                onChangeSelectedDurationSec={changeSelectedDuration}
                onChangeSelectedOnsetSec={(value) =>
                  updateSelectedNote((draft, draftNoteId) => updateNoteTiming(draft, draftNoteId, value))
                }
                onChangeSelectedPitch={changeSelectedPitch}
                onDeleteSelectedNotes={handleDeleteSelectedNotes}
                onQuantizeSelection={quantizeSelection}
                onQuantizeAll={quantizeAllNotes}
                onReassignSelectedDrumLane={handleReassignSelectedDrumLane}
                onRetranscribeRegion={() => void handleRetranscribeRegion()}
                onAnalyzeDraft={() => void handleAnalyzeDraft()}
                onApplySuggestion={handleApplySuggestion}
                onUndo={undo}
                onRedo={redo}
                onSaveDraft={() => void handleSaveDraft()}
                onRevertDraft={resetDraftFromOriginalResult}
                onRestoreSavedDraft={restoreSavedDraft}
                onSelectAddTrack={setAddTrackKey}
                reassignDrumLabel={reassignDrumLabel}
                reassignDrumMidiNote={reassignDrumMidiNote}
                selectedNote={selectedNote}
                selectedNotes={selectedDraftNotes.map((selected) => selected.note)}
                selectedTrack={selectedTrack}
              />
            </div>
            <div className="panel">
              <h2>Draft State</h2>
              <div className="note-list">
                <article className="note-card">
                  <strong>Saved draft state</strong>
                  <div className="muted">
                    {hasSavedDraft
                      ? `Loaded saved draft v${savedDraftVersion ?? 1}. Unsaved changes are tracked separately from that saved revision.`
                      : "No saved draft is stored for this project yet. Use Save draft to persist the current edited JobResult."}
                  </div>
                </article>
                <article className="note-card">
                  <strong>Current draft status</strong>
                  <div className="muted">
                    {draftMatchesOriginal
                      ? "The current draft matches the original completed result."
                      : isDraftDirty
                        ? "The current draft has unsaved changes relative to the last saved baseline."
                        : "The current draft matches the latest saved draft and differs from the original result."}
                  </div>
                </article>
                <article className="note-card">
                  <strong>Current limitation</strong>
                  <div className="muted">
                    Draft save still stores only the latest full edited result per project. Undo/redo history stays session-local.
                  </div>
                </article>
              </div>
            </div>
          </section>

          <section className="content-grid preview-layout">
            <div className="panel">
              <h2>Piano Score Preview</h2>
              <p className="muted">Simplified grand-staff preview for the first visible piano track and the first 8 bars.</p>
              <PianoScorePreview bpm={activeResult.bpm} track={pianoTrack} />
            </div>

            <div className="panel">
              <h2>Drum Notation Preview</h2>
              <p className="muted">Lane-based drum hit grid for the first visible drum track and the first 8 bars.</p>
              <DrumNotationPreview bpm={activeResult.bpm} track={drumTrack} />
            </div>
          </section>
          <section className="content-grid">
            <div className="panel">
              <h2>Piano Event Details</h2>
              {pianoTrack ? (
                <div className="note-list">
                  {pianoTrack.notes.slice(0, 8).map((note) => (
                    <article
                      className={`note-card ${note.draftNoteId && selectedDraftNoteIds.includes(note.draftNoteId) ? "is-selected-card" : ""}`}
                      key={note.draftNoteId ?? note.id}
                      onClick={(event) =>
                        note.draftNoteId &&
                        handleSelectNote(getTrackKey(pianoTrack), note.draftNoteId, {
                          additive: event.metaKey || event.ctrlKey || event.shiftKey
                        })
                      }
                    >
                      <strong>{formatNote(note)}</strong>
                      <div>{formatEventTiming(note)}</div>
                      <div className="muted">
                        provider {pianoTrack.provider} | stem {note.sourceStem ?? "unknown"} | confidence {note.confidence ?? 0}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="muted">Visible piano event details will appear here once the job completes.</p>
              )}
            </div>

            <div className="panel">
              <h2>Drum Event Details</h2>
              {drumTrack ? (
                <div className="note-list">
                  {drumTrack.notes.slice(0, 12).map((note) => (
                    <article
                      className={`note-card ${note.draftNoteId && selectedDraftNoteIds.includes(note.draftNoteId) ? "is-selected-card" : ""}`}
                      key={note.draftNoteId ?? note.id}
                      onClick={(event) =>
                        note.draftNoteId &&
                        handleSelectNote(getTrackKey(drumTrack), note.draftNoteId, {
                          additive: event.metaKey || event.ctrlKey || event.shiftKey
                        })
                      }
                    >
                      <strong>{formatNote(note)}</strong>
                      <div>{formatEventTiming(note)}</div>
                      <div className="muted">
                        provider {drumTrack.provider} | stem {note.sourceStem ?? "unknown"} | confidence {note.confidence ?? 0}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="muted">Visible drum event details will appear here once the job completes.</p>
              )}
            </div>
          </section>

          <section className="content-grid">
            <div className="panel">
              <h2>Warnings</h2>
              <div className="note-list">
                {activeResult.warnings.length > 0 ? (
                  activeResult.warnings.map((warning) => (
                    <article className="note-card" key={warning}>
                      <div>{warning}</div>
                    </article>
                  ))
                ) : (
                  <article className="note-card">
                    <div>No explicit warnings were returned for this result.</div>
                  </article>
                )}
              </div>
            </div>
          </section>
        </>
      ) : mode === "project" ? (
        <section className="content-grid">
          <div className="panel">
            <h2>Project Result Availability</h2>
            <p className="muted">
              This project does not have a persisted original result yet, so the editor workspace is intentionally unavailable.
            </p>
            <div className="note-list">
              <article className="note-card">
                <strong>Status</strong>
                <div>{projectDetail?.status ?? "unknown"}</div>
                <div className="muted">{projectDetail?.statusMessage ?? "Manifest-backed status only."}</div>
              </article>
              {projectDetail?.error ? (
                <article className="note-card">
                  <strong>Error</strong>
                  <div className="muted">{projectDetail.error}</div>
                </article>
              ) : null}
            </div>
          </div>
          <div className="panel">
            <h2>Deferred Productization Limits</h2>
            <p className="muted">
              Phase 12 MVP keeps project metadata and completed results on disk, but it does not provide job recovery, accounts, or public share tokens.
            </p>
          </div>
        </section>
      ) : null}
    </main>
  );
}
