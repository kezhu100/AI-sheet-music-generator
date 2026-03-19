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
  RuntimeDiagnosticsResponse,
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
  getRuntimeDiagnostics,
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

function getRuntimeSeverityClass(severity: RuntimeDiagnosticsResponse["severity"]): string {
  if (severity === "ready") {
    return "pill pill-success";
  }
  if (severity === "degraded") {
    return "pill pill-warning";
  }
  return "pill pill-danger";
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

function formatProjectExportSuccess(savedPath: string): string {
  return `Project exported successfully. / 项目导出成功。\nSaved to / 保存路径: ${savedPath}`;
}

function translateWarningToChinese(warning: string): string {
  const normalizedWarning = warning.toLowerCase();

  if (normalizedWarning.includes("misaligned")) {
    return "部分片段可能存在对齐误差。";
  }
  if (normalizedWarning.includes("fell back") || normalizedWarning.includes("fallback")) {
    return "当前流程已切换到备用方案。";
  }
  if (normalizedWarning.includes("unavailable")) {
    return "当前选择的处理能力不可用。";
  }
  if (normalizedWarning.includes("sparse") || normalizedWarning.includes("noisy")) {
    return "当前节奏证据较少或噪声较多，结果可能不够稳定。";
  }
  if (normalizedWarning.includes("removed")) {
    return "部分事件在规范化清理阶段被移除。";
  }
  if (normalizedWarning.includes("missing")) {
    return "部分本地资源缺失。";
  }

  return "请参考前面的英文提示。";
}

function formatWarningMessage(warning: string): string {
  return `${warning} / ${translateWarningToChinese(warning)}`;
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
  const [runtimeDiagnostics, setRuntimeDiagnostics] = useState<RuntimeDiagnosticsResponse | null>(null);
  const [runtimeDiagnosticsError, setRuntimeDiagnosticsError] = useState<string | null>(null);
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
    let cancelled = false;

    void (async () => {
      try {
        const response = await getRuntimeDiagnostics();
        if (!cancelled) {
          setRuntimeDiagnostics(response);
          setRuntimeDiagnosticsError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setRuntimeDiagnosticsError(
            loadError instanceof Error ? loadError.message : "Failed to load local runtime diagnostics."
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

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
      setExportSuccessMessage(formatProjectExportSuccess(savedPath));
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
    <main className="page workspace-page">
      <section className="hero product-hero">
        <div className="top-nav">
          <Link className="button secondary" href={mode === "home" ? "/projects" : "/"}>
            {mode === "home" ? "Open Library / 打开项目库" : "Back to Home / 返回首页"}
          </Link>
          {mode === "project" ? (
            <Link className="button secondary" href="/projects">
              Back to Library / 返回项目库
            </Link>
          ) : null}
        </div>
        <div className="hero-grid hero-grid-product">
          <div>
            <h1>{mode === "home" ? "AI Sheet Music Generator" : projectDetail?.projectName ?? "Project Workspace / 项目工作区"}</h1>
            <p>
              A local-first creative workspace for turning audio into editable draft notation.
              {" "}
              / 一个本地优先的创作工作区，把音频整理成可编辑的草稿乐谱。
            </p>
            <div className="pill-row">
              <span className="pill">Local-first / 本地优先</span>
              <span className="pill">Editable Draft / 可编辑草稿</span>
              <span className="pill">Score-First Preview / 乐谱优先预览</span>
              <span className="pill">MIDI + MusicXML / 标准导出</span>
              <span className={`pill ${isDraftDirty ? "pill-warning" : "pill-success"}`}>
                {isDraftDirty ? copy.project.unsavedChanges : copy.project.savedDraft}
              </span>
            </div>
          </div>
          <div className="panel inset-panel hero-sidecard">
            <h3>Session Status / 当前状态</h3>
            <div className="note-list compact-list">
              <article className="note-card ornate-card">
                <strong>{job ? `${job.status} · ${job.progress.percent}%` : mode === "project" ? "Project ready / 项目已载入" : "Ready / 已准备好"}</strong>
                <div className="muted">
                  {job ? `${job.progress.stage} / ${job.progress.message}` : "Local browser UI + local runtime / 浏览器界面 + 本地运行时"}
                </div>
              </article>
              {job ? (
                <article className="note-card ornate-card">
                  <strong>Progress / 进度</strong>
                  <div className="status-bar" aria-hidden="true">
                    <div className="status-fill" style={{ width: `${job.progress.percent}%` }} />
                  </div>
                </article>
              ) : null}
              {mode === "project" && projectDetail ? (
                <article className="note-card ornate-card">
                  <strong>Project Route / 项目路由</strong>
                  <div>{projectDetail.sharePath}</div>
                  <div className="muted">{formatProjectAssetSummary(projectDetail)}</div>
                </article>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {mode === "home" ? (
        <section className="content-grid workspace-entry-grid">
          <div className="panel panel-entry">
            <h2>Start a Project / 开始项目</h2>
            <div className="upload-form">
              <div className="upload-box ornate-card">
                <label htmlFor="audio-file">Audio File / 音频文件</label>
                <input
                  id="audio-file"
                  type="file"
                  accept="audio/*"
                  onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
                />
                <p className="muted">Upload a full mix or an isolated stem. / 可以上传完整混音，也可以上传单独音轨素材。</p>
              </div>
              <div className="actions action-bar-primary">
                <button
                  className="button"
                  type="button"
                  disabled={isUploading || isCreatingJob || !selectedFile}
                  onClick={handleUploadAndCreateJob}
                >
                  {isUploading ? "Uploading... / 上传中..." : isCreatingJob ? "Creating Job... / 创建任务中..." : "Generate Score / 生成乐谱"}
                </button>
                <Link className="button secondary" href="/projects">
                  Browse Library / 浏览项目库
                </Link>
                <button
                  className="button tertiary"
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
                  Clear / 清空
                </button>
              </div>
              {job?.result ? (
                <p className="muted section-help">
                  {isLoadingDraft
                    ? "Checking for a saved draft... / 正在检查是否有已保存草稿..."
                    : hasSavedDraft
                      ? `Saved draft v${savedDraftVersion ?? 1} is loaded separately from the original result. / 已加载保存草稿 v${savedDraftVersion ?? 1}。`
                      : "No saved draft yet. Your current editor state can still be exported. / 还没有保存草稿，但当前编辑状态仍可导出。"}
                </p>
              ) : null}
            </div>

            <div className="meta-list compact-list">
              {selectedFile ? (
                <article className="meta-item ornate-card">
                  <strong>Selected File / 已选文件</strong>
                  <div>{selectedFile.name}</div>
                  <div className="muted">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</div>
                </article>
              ) : null}
              {upload ? (
                <article className="meta-item ornate-card">
                  <strong>Stored Upload / 已保存上传</strong>
                  <div>{upload.upload.fileName}</div>
                  <div className="muted">{upload.upload.storedPath}</div>
                </article>
              ) : null}
            </div>
          </div>

          <div className="panel panel-entry side-info-panel">
            <h2>What This Session Creates / 本次将产出</h2>
            <div className="note-list compact-list">
              <article className="note-card ornate-card">
                <strong>Score First / 乐谱优先</strong>
                <div className="muted">The score preview is the main result. Piano roll and technical details stay secondary. / 乐谱预览是主结果，钢琴卷帘和技术信息保持次要。</div>
              </article>
              <article className="note-card ornate-card">
                <strong>Draft-First Editing / 草稿式编辑</strong>
                <div className="muted">You can save edits without changing the original completed result. / 可以保存修改，同时不改变原始完成结果。</div>
              </article>
              <article className="note-card ornate-card">
                <strong>Local Workflow / 本地工作流</strong>
                <div className="muted">Projects, stems, and drafts stay on your machine. / 项目、分轨和草稿都保留在本机。</div>
              </article>
            </div>
          </div>
        </section>
      ) : (
        <section className="content-grid workspace-entry-grid">
          <div className="panel panel-entry">
            <h2>Project Entry / 项目入口</h2>
            {projectDetail ? (
              <div className="meta-list compact-list">
                <article className="meta-item ornate-card">
                  <strong>Project / 项目</strong>
                  <div>{projectDetail.projectName}</div>
                  <div className="muted">{projectDetail.statusMessage ?? "Ready to continue editing locally. / 可以继续在本地编辑。"}</div>
                </article>
                <article className="meta-item ornate-card">
                  <strong>Saved Draft / 已保存草稿</strong>
                  <div>
                    {projectDetail.hasSavedDraft
                      ? `v${projectDetail.draftVersion ?? 1}${projectDetail.draftSavedAt ? ` · ${new Date(projectDetail.draftSavedAt).toLocaleString()}` : ""}`
                      : "No saved draft yet / 暂无已保存草稿"}
                  </div>
                  <div className="muted">Original result stays separate from the editable draft. / 原始结果与编辑草稿保持分离。</div>
                </article>
              </div>
            ) : (
              <p className="muted">Project metadata is not available. / 当前无法读取项目元数据。</p>
            )}
          </div>

          <div className="panel panel-entry side-info-panel">
            <h2>Workspace Notes / 工作区提示</h2>
            <div className="note-list compact-list">
              <article className="note-card ornate-card">
                <strong>Stable Route / 稳定路由</strong>
                <div className="muted">{copy.project.localRouteNotice}</div>
              </article>
              <article className="note-card ornate-card">
                <strong>Current Assets / 当前资产</strong>
                <div className="muted">{projectDetail ? formatProjectAssetSummary(projectDetail) : "No project details available."}</div>
              </article>
            </div>
          </div>
        </section>
      )}

      {error ? <p className="error">{error}</p> : null}
      {exportSuccessMessage ? (
        <section className="panel panel-full">
          <h2>Package Export / 项目包导出</h2>
          <p style={{ whiteSpace: "pre-wrap" }}>{exportSuccessMessage}</p>
        </section>
      ) : null}
      {activeResult ? (
        <>
          <section className="panel workspace-banner ornate-banner">
            <div>
              <strong>{isDraftDirty ? copy.project.unsavedChanges : copy.project.savedDraft}</strong>
              <div className="muted">
                {draftMatchesOriginal
                  ? "The draft still matches the original result. / 当前草稿仍与原始结果一致。"
                  : isDraftDirty
                    ? "You have local edits that are not saved yet. / 你有尚未保存的本地修改。"
                    : "The draft matches the latest saved version and remains separate from the original result. / 当前草稿与最近保存版本一致，并继续与原始结果分离。"}
              </div>
            </div>
            <div className="actions">
              <button className="button" type="button" disabled={!activeResult || isSavingDraft} onClick={() => void handleSaveDraft()}>
                {isSavingDraft ? "Saving Draft... / 保存中..." : "Save Draft / 保存草稿"}
              </button>
              <button
                className="button secondary"
                type="button"
                disabled={!activeResult || isExportingDraftMusicXml}
                onClick={() => void handleMusicXmlExport("draft")}
              >
                {isExportingDraftMusicXml ? "Exporting... / 导出中..." : "Export Draft Score / 导出当前草稿"}
              </button>
            </div>
          </section>
          <section className="panel panel-full layer-strip-panel">
            <div className="section-heading-row">
              <div>
                <div className="eyebrow">Viewing Controls / 视图控制</div>
                <h2>Visible Layers / 可见层</h2>
                <p className="muted section-help">
                  Choose which layers remain visible across score reading and editing. /
                  选择哪些轨道继续显示在乐谱预览与编辑工作区中。
                </p>
              </div>
            </div>
            <TrackVisibilityControls
              onHideAllTracks={() => setVisibleTrackKeys([])}
              onShowAllTracks={() => setVisibleTrackKeys(previewTracks.map((track) => track.key))}
              onToggleTrack={toggleTrackVisibility}
              tracks={previewTracks}
              visibleTrackKeys={visibleTrackKeys}
            />
          </section>
          <section className="panel result-hero-panel">
            <div className="section-heading-row">
              <div>
                <div className="eyebrow">Main Result / 主结果</div>
                <h2>Score Preview / 乐谱预览</h2>
                <p className="muted section-help">
                  Read the piano score first, then compare the drum companion below before refining the draft.
                  {" "}
                  / 先查看生成后的乐谱，再用下方工具微调时值、音高和鼓点。
                </p>
              </div>
              <div className="result-meta-chip">{activeResult.bpm} BPM</div>
            </div>
            <div className="score-stack">
              <div className="score-primary-card ornate-card">
                <h3>Piano Score / 钢琴乐谱</h3>
                <PianoScorePreview bpm={activeResult.bpm} track={pianoTrack} />
              </div>
              <div className="score-secondary-card ornate-card">
                <h3>Drum Companion / 鼓谱辅助预览</h3>
                <DrumNotationPreview bpm={activeResult.bpm} track={drumTrack} />
              </div>
            </div>
          </section>

          {false ? (
          <section className="content-grid result-support-grid">
            <div className="panel panel-support">
              <h2>Piano Roll Editor / 钢琴卷帘编辑器</h2>
              <p className="muted section-help">
                Split previews keep piano and drums readable while preserving the same draft editing flow. /
                分离预览让钢琴和鼓组更易读，同时保持同一套草稿编辑流程。
              </p>
              <div className="preview-dual-grid">
                <div className="ornate-card preview-panel">
                  <h3>Piano Preview / 钢琴预览</h3>
                  <PianoRollPreview
                    bpm={activeResult!.bpm}
                    instrumentFilter="piano"
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
                <div className="ornate-card preview-panel">
                  <h3>Drum Preview / 鼓组预览</h3>
                  <PianoRollPreview
                    bpm={activeResult!.bpm}
                    instrumentFilter="drums"
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
              </div>
            </div>
            <div className="panel panel-support">
              <h2>Visible Layers / 可见轨道</h2>
              <TrackVisibilityControls
                onHideAllTracks={() => setVisibleTrackKeys([])}
                onShowAllTracks={() => setVisibleTrackKeys(previewTracks.map((track) => track.key))}
                onToggleTrack={toggleTrackVisibility}
                tracks={previewTracks}
                visibleTrackKeys={visibleTrackKeys}
              />
            </div>
          </section>
          ) : null}

          <section className="content-grid editing-section-grid">
            <div className="panel panel-full">
              <div className="section-heading-row">
                <div>
                  <div className="eyebrow">Editing Area / 编辑区</div>
                  <h2>Refine the Draft / 调整草稿</h2>
                </div>
              </div>
              <p className="muted section-help">
                Use one wide combined track editor for piano and drums, then apply precise edits and draft tools below. /
                使用一个统一的宽轨道编辑区同时处理钢琴和鼓组，再在下方进行精细编辑与草稿操作。
              </p>
              <div className="ornate-card preview-panel editor-workspace-panel">
                <h3>Track Editor / 轨道编辑器</h3>
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
          </section>

          <section className="content-grid export-grid">
            <div className="panel panel-full export-panel ornate-card">
              <div className="section-heading-row">
                <div>
                  <div className="eyebrow">Export / 导出</div>
                  <h2>Export the Draft / 导出当前草稿</h2>
                  <p className="muted section-help">Draft export uses the current editable score. Original export keeps the untouched generated result. / 草稿导出使用当前可编辑乐谱，原始导出保留未修改的生成结果。</p>
                </div>
              </div>
              <div className="export-card-grid">
                <article className="note-card ornate-card">
                  <strong>Current Draft / 当前草稿</strong>
                  <div className="actions">
                    <button className="button" type="button" disabled={!activeResult || isExportingDraftMidi} onClick={() => void handleMidiExport("draft")}>
                      {isExportingDraftMidi ? "Exporting MIDI... / 导出中..." : "Draft MIDI / 草稿 MIDI"}
                    </button>
                    <button className="button" type="button" disabled={!activeResult || isExportingDraftMusicXml} onClick={() => void handleMusicXmlExport("draft")}>
                      {isExportingDraftMusicXml ? "Exporting MusicXML... / 导出中..." : "Draft MusicXML / 草稿 MusicXML"}
                    </button>
                  </div>
                </article>
                <article className="note-card ornate-card">
                  <strong>Original Result / 原始结果</strong>
                  <div className="actions">
                    <button className="button secondary" type="button" disabled={!job?.result || isExportingOriginalMidi} onClick={() => void handleMidiExport("original")}>
                      {isExportingOriginalMidi ? "Exporting MIDI... / 导出中..." : "Original MIDI / 原始 MIDI"}
                    </button>
                    <button className="button secondary" type="button" disabled={!job?.result || isExportingOriginalMusicXml} onClick={() => void handleMusicXmlExport("original")}>
                      {isExportingOriginalMusicXml ? "Exporting MusicXML... / 导出中..." : "Original MusicXML / 原始 MusicXML"}
                    </button>
                  </div>
                </article>
                <article className="note-card ornate-card">
                  <strong>Project Package / 项目打包</strong>
                  <div className="muted">
                    Export the local-first project bundle as a ZIP package. / 将本地项目打包为 ZIP 压缩包。
                  </div>
                  <div className="actions">
                    <button
                      className="button secondary"
                      type="button"
                      disabled={!projectDetail || isExportingProjectPackage}
                      onClick={() => void handleExportProjectPackage()}
                    >
                      {isExportingProjectPackage
                        ? "Exporting Project... / 导出项目中..."
                        : "Export Project (.zip) / 导出项目（ZIP压缩包）"}
                    </button>
                  </div>
                  {!projectDetail ? (
                    <div className="muted">
                      Reopen from a local project route to package the full project. / 请从本地项目路由重新打开后再导出完整项目包。
                    </div>
                  ) : null}
                </article>
              </div>
            </div>
          </section>

          <details className="panel advanced-details">
            <summary>Advanced Details / 高级详情</summary>
            <div className="advanced-details-body">
              <div className="content-grid">
                <div className="panel inset-panel">
                  <h3>Runtime / 运行状态</h3>
                  {runtimeDiagnostics ? (
                    <div className="note-list compact-list">
                      <article className="note-card ornate-card">
                        <strong className={getRuntimeSeverityClass(runtimeDiagnostics.severity)}>{runtimeDiagnostics.severity}</strong>
                        <div className="muted">{runtimeDiagnostics.summary}</div>
                      </article>
                      {runtimeDiagnostics.providers.map((provider) => (
                        <article className="note-card ornate-card" key={provider.key}>
                          <strong>{provider.label}</strong>
                          <div>{provider.status === "ready" ? "Ready / 就绪" : "Needs Attention / 需要关注"}</div>
                          <div className="muted">{provider.message}</div>
                        </article>
                      ))}
                    </div>
                  ) : runtimeDiagnosticsError ? (
                    <p className="error">{runtimeDiagnosticsError}</p>
                  ) : (
                    <p className="muted">Loading runtime diagnostics... / 正在加载运行时信息...</p>
                  )}
                </div>

                {mode === "project" ? (
                  <div className="panel inset-panel">
                    <h3>{copy.project.projectSettings}</h3>
                    {projectDetail ? (
                      <div className="note-list compact-list">
                        <article className="note-card ornate-card">
                          <strong>Route / 路由</strong>
                          <div className="muted">{copy.project.localRouteNotice}</div>
                        </article>
                        <div className="actions">
                          <button className="button secondary" type="button" onClick={() => void handleCopyProjectLink()}>
                            {copy.project.copyLinkAction}
                          </button>
                          <button className="button secondary" type="button" disabled={isExportingProjectPackage} onClick={() => void handleExportProjectPackage()}>
                            {isExportingProjectPackage ? "Exporting Package... / 导出中..." : "Export Package / 导出项目包"}
                          </button>
                          <button className="button tertiary" type="button" disabled={isRenamingProject} onClick={() => void handleRenameProject()}>
                            {copy.project.renameAction}
                          </button>
                          <button className="button tertiary" type="button" disabled={isDuplicatingProject} onClick={() => void handleDuplicateProject()}>
                            {copy.project.duplicateAction}
                          </button>
                          <button className="button tertiary danger-button" type="button" disabled={isDeletingProject} onClick={() => void handleDeleteProject()}>
                            {copy.project.deleteAction}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="content-grid">
                <div className="panel inset-panel">
                  <h3>Track Summary / 轨道摘要</h3>
                  {trackSummaries.length > 0 ? (
                    <div className="track-list compact-list">
                      {trackSummaries.map((track) => (
                        <article className="track-card ornate-card" key={`${track.instrument}-${track.sourceStem}`}>
                          <strong>{track.instrument} | {track.sourceStem}</strong>
                          <div className="muted">Provider: {track.provider}</div>
                          <div>{track.eventCount} events</div>
                          <div className="muted">Average confidence: {track.avgConfidence}</div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="muted">Track information appears after generation completes. / 生成完成后会显示轨道信息。</p>
                  )}
                </div>

                <div className="panel inset-panel">
                  <h3>Generated Stems / 已生成分轨</h3>
                  {activeResult.stems.length > 0 ? (
                    <div className="track-list compact-list">
                      {activeResult.stems.map((stem) => (
                        <article className="track-card ornate-card" key={stem.stemName}>
                          <strong>{stem.instrumentHint} - {stem.stemName}</strong>
                          <div>{stem.fileName}</div>
                          <div className="muted">{stem.provider}</div>
                          <div className="muted">{stem.storedPath}</div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="muted">No stem assets were returned. / 当前结果没有返回分轨资产。</p>
                  )}
                </div>
              </div>

              <div className="content-grid">
                <div className="panel inset-panel">
                  <h3>Piano Notes / 钢琴音符详情</h3>
                  {pianoTrack ? (
                    <div className="note-list compact-list">
                      {pianoTrack.notes.slice(0, 8).map((note) => (
                        <article
                          className={`note-card ornate-card ${note.draftNoteId && selectedDraftNoteIds.includes(note.draftNoteId) ? "is-selected-card" : ""}`}
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
                          <div className="muted">{pianoTrack.provider} | {note.sourceStem ?? "unknown"}</div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="muted">No visible piano notes yet. / 当前还没有可见钢琴音符。</p>
                  )}
                </div>

                <div className="panel inset-panel">
                  <h3>Drum Notes / 鼓点详情</h3>
                  {drumTrack ? (
                    <div className="note-list compact-list">
                      {drumTrack.notes.slice(0, 12).map((note) => (
                        <article
                          className={`note-card ornate-card ${note.draftNoteId && selectedDraftNoteIds.includes(note.draftNoteId) ? "is-selected-card" : ""}`}
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
                          <div className="muted">{drumTrack.provider} | {note.sourceStem ?? "unknown"}</div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="muted">No visible drum notes yet. / 当前还没有可见鼓点。</p>
                  )}
                </div>
              </div>

              <section className="panel inset-panel panel-full">
                <h3>Warnings / 提示与限制</h3>
                <div className="note-list compact-list">
                  {activeResult.warnings.length > 0 ? (
                    activeResult.warnings.map((warning) => (
                      <article className="note-card ornate-card" key={warning}>
                        <div>{formatWarningMessage(warning)}</div>
                      </article>
                    ))
                  ) : (
                    <article className="note-card ornate-card">
                      <div>No explicit warnings were returned. / 当前结果没有额外提示。</div>
                    </article>
                  )}
                </div>
              </section>
            </div>
          </details>
        </>
      ) : mode === "project" ? (
        <section className="content-grid">
          <div className="panel">
            <h2>Project Result Availability / 项目结果状态</h2>
            <p className="muted">
              This project does not have a persisted original result yet, so the editor workspace is intentionally unavailable.
              {" "}
              / 这个项目还没有可持久化的原始结果，因此暂时无法进入编辑工作区。
            </p>
            <div className="note-list compact-list">
              <article className="note-card ornate-card">
                <strong>Status / 状态</strong>
                <div>{projectDetail?.status ?? "unknown"}</div>
                <div className="muted">{projectDetail?.statusMessage ?? "Manifest-backed status only."}</div>
              </article>
              {projectDetail?.error ? (
                <article className="note-card ornate-card">
                  <strong>Error / 错误</strong>
                  <div className="muted">{projectDetail.error}</div>
                </article>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}
    </main>
  );
}
