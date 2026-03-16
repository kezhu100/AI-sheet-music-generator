"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildPreviewTracks,
  formatEventTiming,
  getVisibleTracks,
  summarizeJobResult
} from "@ai-sheet-music-generator/music-engine";
import type { JobRecord, NoteEvent, UploadResponse } from "@ai-sheet-music-generator/shared-types";
import { createJob, downloadMidiExport, downloadMusicXmlExport, getJob, uploadAudio } from "../lib/api";
import { DrumNotationPreview } from "./components/DrumNotationPreview";
import { PianoRollPreview } from "./components/PianoRollPreview";
import { PianoScorePreview } from "./components/PianoScorePreview";
import { TrackVisibilityControls } from "./components/TrackVisibilityControls";

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
  const [isExportingMidi, setIsExportingMidi] = useState(false);
  const [isExportingMusicXml, setIsExportingMusicXml] = useState(false);
  const [visibleTrackKeys, setVisibleTrackKeys] = useState<string[]>([]);

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

  const trackSummaries = useMemo(() => {
    if (!job?.result) {
      return [];
    }

    return summarizeJobResult(job.result);
  }, [job]);

  const previewTracks = useMemo(() => {
    return job?.result ? buildPreviewTracks(job.result.tracks) : [];
  }, [job]);

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
    return job?.result ? getVisibleTracks(job.result.tracks, visibleTrackKeys) : [];
  }, [job, visibleTrackKeys]);

  const pianoTrack = useMemo(() => {
    return visibleTracks.find((track) => track.instrument === "piano") ?? null;
  }, [visibleTracks]);

  const drumTrack = useMemo(() => {
    return visibleTracks.find((track) => track.instrument === "drums") ?? null;
  }, [visibleTracks]);

  async function handleUploadAndCreateJob(): Promise<void> {
    if (!selectedFile) {
      setError("Choose an audio file first.");
      return;
    }

    setError(null);
    setIsUploading(true);
    setUpload(null);
    setJob(null);

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

  async function handleMidiExport(): Promise<void> {
    if (!job?.result) {
      setError("Complete a job before exporting MIDI.");
      return;
    }

    setError(null);
    setIsExportingMidi(true);

    try {
      const midiBlob = await downloadMidiExport(job.id);
      const url = window.URL.createObjectURL(midiBlob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${job.result.projectName || "ai-sheet-music-generator"}.mid`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Failed to export MIDI.");
    } finally {
      setIsExportingMidi(false);
    }
  }

  async function handleMusicXmlExport(): Promise<void> {
    if (!job?.result) {
      setError("Complete a job before exporting MusicXML.");
      return;
    }

    setError(null);
    setIsExportingMusicXml(true);

    try {
      const musicXmlBlob = await downloadMusicXmlExport(job.id);
      const url = window.URL.createObjectURL(musicXmlBlob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${job.result.projectName || "ai-sheet-music-generator"}.musicxml`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Failed to export MusicXML.");
    } finally {
      setIsExportingMusicXml(false);
    }
  }

  function toggleTrackVisibility(trackKey: string): void {
    setVisibleTrackKeys((currentKeys) =>
      currentKeys.includes(trackKey) ? currentKeys.filter((key) => key !== trackKey) : [...currentKeys, trackKey]
    );
  }

  return (
    <main className="page">
      <section className="hero">
        <div className="hero-grid">
          <div>
            <h1>AI Sheet Music Generator</h1>
            <p>
              Upload a song or stem, create a job, inspect the normalized result, and preview piano-roll, piano score,
              and drum notation views before exporting a draft MIDI or MusicXML file.
            </p>
            <div className="pill-row">
              <span className="pill">Phase 7 score preview</span>
              <span className="pill">Track visibility toggles</span>
              <span className="pill">Real heuristic PCM WAV providers</span>
              <span className="pill">Warnings stay explicit</span>
            </div>
          </div>
          <div className="panel">
            <h3>Current API contract</h3>
            <p className="muted">
              Frontend calls <code className="inline">/api/v1/uploads</code>, then
              <code className="inline"> /api/v1/jobs</code>, and polls
              <code className="inline"> /api/v1/jobs/:id</code>.
            </p>
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
                  setError(null);
                }}
              >
                Reset
              </button>
              <button
                className="button secondary"
                type="button"
                disabled={!job?.result || isExportingMidi}
                onClick={handleMidiExport}
              >
                {isExportingMidi ? "Exporting MIDI..." : "Download MIDI"}
              </button>
              <button
                className="button secondary"
                type="button"
                disabled={!job?.result || isExportingMusicXml}
                onClick={handleMusicXmlExport}
              >
                {isExportingMusicXml ? "Exporting MusicXML..." : "Download MusicXML"}
              </button>
            </div>
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
          {job?.result ? (
            <>
              <p className="muted">Estimated tempo: {job.result.bpm} BPM</p>
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
          {job?.result ? (
            <div className="track-list">
              {job.result.stems.map((stem) => (
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
          {job?.result ? <PianoRollPreview tracks={visibleTracks} /> : <p className="muted">Visible track notes will render here after the job completes.</p>}
        </div>
      </section>

      <section className="content-grid preview-layout">
        <div className="panel">
          <h2>Piano Score Preview</h2>
          {job?.result ? (
            <>
              <p className="muted">Simplified grand-staff preview for the first visible piano track and the first 8 bars.</p>
              <PianoScorePreview bpm={job.result.bpm} track={pianoTrack} />
            </>
          ) : (
            <p className="muted">A simple piano score preview will appear here once the job completes.</p>
          )}
        </div>

        <div className="panel">
          <h2>Drum Notation Preview</h2>
          {job?.result ? (
            <>
              <p className="muted">Lane-based drum hit grid for the first visible drum track and the first 8 bars.</p>
              <DrumNotationPreview bpm={job.result.bpm} track={drumTrack} />
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
                  <article className="note-card" key={note.id}>
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
                  <article className="note-card" key={note.id}>
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
          {job?.result ? (
            <div className="note-list">
              {job.result.warnings.map((warning) => (
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
