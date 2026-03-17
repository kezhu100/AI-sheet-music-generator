"use client";

import Link from "next/link";
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
  UploadResponse
} from "@ai-sheet-music-generator/shared-types";
import {
  analyzeDraft,
  createJob,
  downloadMidiExport,
  downloadMusicXmlExport,
  getJob,
  getJobDraft,
  saveJobDraft,
  uploadAudio
} from "../lib/api";
import { DrumNotationPreview } from "./components/DrumNotationPreview";
import { NoteEditorPanel } from "./components/NoteEditorPanel";
import { PianoRollPreview } from "./components/PianoRollPreview";
import { PianoScorePreview } from "./components/PianoScorePreview";
import { TrackVisibilityControls } from "./components/TrackVisibilityControls";
import { useEditableJobResult } from "./hooks/useEditableJobResult";

function formatNote(note: NoteEvent): string {
  if (note.instrument === "drums") {
    return `${note.drumLabel ?? "drum"} (${note.midiNote ?? "n/a"})`;
  }

  return `MIDI ${note.pitch ?? "n/a"}`;
}

export default function HomePage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [upload, setUpload] = useState<UploadResponse | null>(null);
  const [job, setJob] = useState<JobRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isCreatingJob, setIsCreatingJob] = useState(false);
  const [isExportingOriginalMidi, setIsExportingOriginalMidi] = useState(false);
  const [isExportingDraftMidi, setIsExportingDraftMidi] = useState(false);
  const [isExportingOriginalMusicXml, setIsExportingOriginalMusicXml] = useState(false);
  const [isExportingDraftMusicXml, setIsExportingDraftMusicXml] = useState(false);
  const [savedDraft, setSavedDraft] = useState<JobDraftRecord | null>(null);
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
    if (!job || job.status === "completed" || job.status === "failed") {
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
  }, [job]);

  useEffect(() => {
    if (!job?.result || job.status !== "completed") {
      setSavedDraft(null);
      lastDraftJobIdRef.current = null;
      return;
    }

    if (lastDraftJobIdRef.current === job.id) {
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
          setSavedDraft(null);
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
  }, [job?.id, job?.result, job?.status]);

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

  async function handleUploadAndCreateJob(): Promise<void> {
    if (!selectedFile) {
      setError("Choose an audio file first.");
      return;
    }

    setError(null);
    setIsUploading(true);
    setUpload(null);
    setJob(null);
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

  async function handleMidiExport(mode: "original" | "draft"): Promise<void> {
    if (!job?.result) {
      setError("Complete a job before exporting MIDI.");
      return;
    }

    if (mode === "draft" && !activeResult) {
      setError("Draft result is not available yet.");
      return;
    }

    setError(null);
    if (mode === "original") {
      setIsExportingOriginalMidi(true);
    } else {
      setIsExportingDraftMidi(true);
    }

    try {
      const midiBlob = await downloadMidiExport(job.id, mode === "draft" ? getCurrentDraftResult() : undefined);
      const url = window.URL.createObjectURL(midiBlob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${(mode === "draft" ? activeResult : job.result)?.projectName || "ai-sheet-music-generator"}-${mode}.mid`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Failed to export MIDI.");
    } finally {
      if (mode === "original") {
        setIsExportingOriginalMidi(false);
      } else {
        setIsExportingDraftMidi(false);
      }
    }
  }

  async function handleMusicXmlExport(mode: "original" | "draft"): Promise<void> {
    if (!job?.result) {
      setError("Complete a job before exporting MusicXML.");
      return;
    }

    if (mode === "draft" && !activeResult) {
      setError("Draft result is not available yet.");
      return;
    }

    setError(null);
    if (mode === "original") {
      setIsExportingOriginalMusicXml(true);
    } else {
      setIsExportingDraftMusicXml(true);
    }

    try {
      const musicXmlBlob = await downloadMusicXmlExport(job.id, mode === "draft" ? getCurrentDraftResult() : undefined);
      const url = window.URL.createObjectURL(musicXmlBlob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${(mode === "draft" ? activeResult : job.result)?.projectName || "ai-sheet-music-generator"}-${mode}.musicxml`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Failed to export MusicXML.");
    } finally {
      if (mode === "original") {
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

  const draftMatchesOriginal = useMemo(() => {
    return areJobResultsEqual(activeResult, job?.result ?? null);
  }, [activeResult, job?.result]);

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
    activeResult?.bpm,
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

  return (
    <main className="page">
      <section className="hero">
        <div className="hero-grid">
          <div>
            <h1>AI Sheet Music Generator</h1>
            <p>
              Upload a song or stem, create a job, inspect the normalized result, and preview piano-roll, piano score,
              and drum notation views, then save, multi-select, quantize, re-transcribe selected regions, run AI-assisted draft analysis, and continue Phase 11F draft edits before exporting original or edited MIDI and MusicXML.
            </p>
            <div className="pill-row">
              <span className="pill">Phase 11F draft suggestions</span>
              <span className="pill">Undo / redo</span>
              <span className="pill">Box selection</span>
              <span className="pill">Quantize + region retry</span>
              <span className="pill">Analyze + apply suggestions</span>
              <span className="pill">Track visibility toggles</span>
              <span className="pill">Original vs draft export</span>
            </div>
          </div>
          <div className="panel">
            <h3>Current API contract</h3>
            <p className="muted">
              Frontend calls <code className="inline">/api/v1/uploads</code>, then
              <code className="inline"> /api/v1/jobs</code>, polls
              <code className="inline"> /api/v1/jobs/:id</code>, auto-loads
              <code className="inline"> /api/v1/jobs/:id/draft</code>, can call
              <code className="inline"> /api/v1/jobs/:id/retranscribe-region</code> and
              <code className="inline"> /api/v1/jobs/:id/analyze-draft</code>, and can save or export a validated edited result payload separately from the original job result.
            </p>
            <p className="muted">
              Phase 12 MVP adds a local project library and stable project routes while keeping the original completed result,
              saved draft, and in-session editable draft as separate states.
            </p>
            <div className="actions">
              <Link className="button secondary" href="/projects">
                Open local project library
              </Link>
            </div>
          </div>
        </div>
      </section>

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
              <p className="muted">Mixed songs and isolated stems both route through the same job pipeline.</p>
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
              <button
                className="button secondary"
                type="button"
                onClick={() => {
                  setSelectedFile(null);
                  setUpload(null);
                  setJob(null);
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
              <Link className="button secondary" href="/projects">
                Browse local library
              </Link>
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
            </div>
            {job?.result ? (
              <p className="muted">
                {isLoadingDraft
                  ? "Checking for a saved draft..."
                  : hasSavedDraft
                    ? `Saved draft v${savedDraftVersion ?? 1} is loaded separately from the original result.`
                    : "No saved draft found yet. Draft export uses the current editor state."}
              </p>
            ) : null}
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

      <section className="content-grid">
        <div className="panel">
          <h2>Track Summary</h2>
          {activeResult ? (
            <>
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
            </>
          ) : (
            <p className="muted">Track output will appear here once the job completes.</p>
          )}
        </div>

        <div className="panel">
          <h2>Generated Stems</h2>
          {activeResult ? (
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
          ) : (
            <p className="muted">Persisted stems will appear here once the job completes.</p>
          )}
        </div>
      </section>

      <section className="content-grid preview-layout">
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

        <div className="panel">
          <h2>Piano-Roll Preview</h2>
          {activeResult ? (
            <>
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
            </>
          ) : (
            <p className="muted">Visible track notes will render here after the job completes.</p>
          )}
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
          <h2>Editing Scope</h2>
          <div className="note-list">
            <article className="note-card">
              <strong>Saved draft state</strong>
              <div className="muted">
                {hasSavedDraft
                  ? `Loaded saved draft v${savedDraftVersion ?? 1}. Unsaved changes are tracked separately from that saved revision.`
                  : "No saved draft is stored for this job yet. Use Save draft to persist the current edited JobResult."}
              </div>
            </article>
            <article className="note-card">
              <strong>Export distinction</strong>
              <div className="muted">
                Original export always uses the completed backend result. Draft export uses the current editable draft,
                whether it came from auto-loaded saved data or unsaved in-browser changes.
              </div>
            </article>
            <article className="note-card">
              <strong>Current limitation</strong>
              <div className="muted">
                Draft save still stores only the latest full edited result per job. Undo/redo history is session-local and is not persisted as revision history.
              </div>
            </article>
            {job?.result ? (
              <article className="note-card">
                <strong>Draft status</strong>
                <div className="muted">
                  {draftMatchesOriginal
                    ? "The current draft matches the original completed result."
                    : isDraftDirty
                      ? "The current draft has unsaved changes relative to the last saved baseline."
                      : "The current draft matches the latest saved draft and differs from the original result."}
                </div>
              </article>
            ) : null}
          </div>
        </div>
      </section>

      <section className="content-grid preview-layout">
        <div className="panel">
          <h2>Piano Score Preview</h2>
          {activeResult ? (
            <>
              <p className="muted">Simplified grand-staff preview for the first visible piano track and the first 8 bars.</p>
              <PianoScorePreview bpm={activeResult.bpm} track={pianoTrack} />
            </>
          ) : (
            <p className="muted">A simple piano score preview will appear here once the job completes.</p>
          )}
        </div>

        <div className="panel">
          <h2>Drum Notation Preview</h2>
          {activeResult ? (
            <>
              <p className="muted">Lane-based drum hit grid for the first visible drum track and the first 8 bars.</p>
              <DrumNotationPreview bpm={activeResult.bpm} track={drumTrack} />
            </>
          ) : (
            <p className="muted">A simple drum notation view will appear here once the job completes.</p>
          )}
        </div>
      </section>

      <section className="content-grid">
        <div className="panel">
          <h2>Piano Event Details</h2>
          {pianoTrack ? (
            <div className="note-list">
              {pianoTrack.notes.length > 0 ? (
                pianoTrack.notes.slice(0, 8).map((note) => (
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
                ))
              ) : (
                <article className="note-card">
                  <strong>No piano notes detected</strong>
                  <div className="muted">
                    Phase 3 real transcription currently works best for simple uncompressed PCM WAV stems.
                  </div>
                </article>
              )}
            </div>
          ) : (
            <p className="muted">Visible piano event details will appear here once the job completes.</p>
          )}
        </div>

        <div className="panel">
          <h2>Drum Event Details</h2>
          {drumTrack ? (
            <div className="note-list">
              {drumTrack.notes.length > 0 ? (
                drumTrack.notes.slice(0, 12).map((note) => (
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
                ))
              ) : (
                <article className="note-card">
                  <strong>No drum hits detected</strong>
                  <div className="muted">
                    Phase 4 drum transcription is real but heuristic and currently works best for clear PCM WAV
                    percussive onsets.
                  </div>
                </article>
              )}
            </div>
          ) : (
            <p className="muted">Visible drum event details will appear here once the job completes.</p>
          )}
        </div>
      </section>

      <section className="content-grid">
        <div className="panel">
          <h2>Warnings</h2>
          {activeResult ? (
            <div className="note-list">
              {activeResult.warnings.map((warning) => (
                <article className="note-card" key={warning}>
                  <div>{warning}</div>
                </article>
              ))}
            </div>
          ) : (
            <p className="muted">Current runtime limitations will appear here with the result.</p>
          )}
        </div>
      </section>
    </main>
  );
}
