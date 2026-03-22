"use client";

import type { ReactNode } from "react";
import { formatEventTiming, getTrackKey, type TrackSummary } from "@ai-sheet-music-generator/music-engine";
import type { JobResult, NoteEvent, ProjectDetail, RuntimeDiagnosticsResponse, TrackResult } from "@ai-sheet-music-generator/shared-types";

type WorkspaceMode = "home" | "project";

interface ProjectCopyText {
  projectSettings: string;
  localRouteNotice: string;
  copyLinkAction: string;
  renameAction: string;
  duplicateAction: string;
  deleteAction: string;
}

interface ProjectWorkspaceAdvancedDetailsProps {
  runtimeDiagnostics: RuntimeDiagnosticsResponse | null;
  runtimeDiagnosticsError: string | null;
  mode: WorkspaceMode;
  projectCopy: ProjectCopyText;
  projectDetail?: ProjectDetail | null;
  isExportingProjectPackage: boolean;
  onExportProjectPackage: () => void;
  onCopyProjectLink: () => void;
  onRenameProject: () => void;
  onDuplicateProject: () => void;
  onDeleteProject: () => void;
  isRenamingProject: boolean;
  isDuplicatingProject: boolean;
  isDeletingProject: boolean;
  trackSummaries: TrackSummary[];
  activeResult: JobResult;
  pianoTrack?: TrackResult;
  drumTrack?: TrackResult;
  selectedDraftNoteIds: string[];
  onSelectNote: (trackKey: string, draftNoteId: string, options?: { additive?: boolean }) => void;
  formatWarningMessage: (warning: string) => string;
  renderBilingualText: (text: string) => ReactNode;
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

export function ProjectWorkspaceAdvancedDetails({
  runtimeDiagnostics,
  runtimeDiagnosticsError,
  mode,
  projectCopy,
  projectDetail,
  isExportingProjectPackage,
  onExportProjectPackage,
  onCopyProjectLink,
  onRenameProject,
  onDuplicateProject,
  onDeleteProject,
  isRenamingProject,
  isDuplicatingProject,
  isDeletingProject,
  trackSummaries,
  activeResult,
  pianoTrack,
  drumTrack,
  selectedDraftNoteIds,
  onSelectNote,
  formatWarningMessage,
  renderBilingualText
}: ProjectWorkspaceAdvancedDetailsProps) {
  return (
    <details className="panel advanced-details">
      <summary>Advanced Details / 高级信息</summary>
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
                    {provider.customProviders.length > 0 ? (
                      <div className="muted">
                        Custom registered: {provider.customProviders.length} / 已注册自定义提供方：{provider.customProviders.length}
                      </div>
                    ) : null}
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
              <h3>{projectCopy.projectSettings}</h3>
              {projectDetail ? (
                <div className="note-list compact-list">
                  <article className="note-card ornate-card">
                    <strong>Route / 路由</strong>
                    <div className="muted">{renderBilingualText(projectCopy.localRouteNotice)}</div>
                  </article>
                  <div className="actions">
                    <button className="button secondary" type="button" onClick={onCopyProjectLink}>
                      {projectCopy.copyLinkAction}
                    </button>
                    <button className="button secondary" type="button" disabled={isExportingProjectPackage} onClick={onExportProjectPackage}>
                      {isExportingProjectPackage ? "Exporting Package... / 正在导出包..." : "Export Package / 导出项目包"}
                    </button>
                    <button className="button tertiary" type="button" disabled={isRenamingProject} onClick={onRenameProject}>
                      {projectCopy.renameAction}
                    </button>
                    <button className="button tertiary" type="button" disabled={isDuplicatingProject} onClick={onDuplicateProject}>
                      {projectCopy.duplicateAction}
                    </button>
                    <button className="button tertiary danger-button" type="button" disabled={isDeletingProject} onClick={onDeleteProject}>
                      {projectCopy.deleteAction}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="content-grid">
          <div className="panel inset-panel">
            <h3>Track Summary / 音轨摘要</h3>
            {trackSummaries.length > 0 ? (
              <div className="track-list compact-list">
                {trackSummaries.map((track) => (
                  <article className="track-card ornate-card" key={`${track.instrument}-${track.sourceStem}`}>
                    <strong>
                      {track.instrument} | {track.sourceStem}
                    </strong>
                    <div className="muted">Provider: {track.provider}</div>
                    <div>{track.eventCount} events</div>
                    <div className="muted">Average confidence: {track.avgConfidence}</div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="muted">Track information appears after generation completes. / 生成完成后会显示音轨信息。</p>
            )}
          </div>

          <div className="panel inset-panel">
            <h3>Stem Summary / Stem 摘要</h3>
            {activeResult.stems.length > 0 ? (
              <div className="track-list compact-list">
                {activeResult.stems.map((stem) => (
                  <article className="track-card ornate-card" key={stem.stemName}>
                    <strong>
                      {stem.instrumentHint} - {stem.stemName}
                    </strong>
                    <div>{stem.fileName}</div>
                    <div className="muted">{stem.provider}</div>
                    <div className="muted">{stem.storedPath}</div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="muted">No stem assets were returned. / 当前结果没有返回 stem 资源。</p>
            )}
          </div>
        </div>

        <div className="content-grid">
          <div className="panel inset-panel">
            <h3>Piano Note Summary / 钢琴音符摘要</h3>
            {pianoTrack ? (
              <div className="note-list compact-list">
                {pianoTrack.notes.slice(0, 8).map((note) => (
                  <article
                    className={`note-card ornate-card ${
                      note.draftNoteId && selectedDraftNoteIds.includes(note.draftNoteId) ? "is-selected" : ""
                    }`}
                    key={note.draftNoteId ?? note.id}
                    onClick={(event) =>
                      note.draftNoteId &&
                      onSelectNote(getTrackKey(pianoTrack), note.draftNoteId, {
                        additive: event.metaKey || event.ctrlKey || event.shiftKey
                      })
                    }
                  >
                    <strong>{formatNote(note)}</strong>
                    <div>{formatEventTiming(note)}</div>
                    <div className="muted">
                      {pianoTrack.provider} | {note.sourceStem ?? "unknown"}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="muted">No visible piano notes yet. / 当前还没有可见的钢琴音符。</p>
            )}
          </div>

          <div className="panel inset-panel">
            <h3>Drum Note Summary / 鼓组音符摘要</h3>
            {drumTrack ? (
              <div className="note-list compact-list">
                {drumTrack.notes.slice(0, 12).map((note) => (
                  <article
                    className={`note-card ornate-card ${
                      note.draftNoteId && selectedDraftNoteIds.includes(note.draftNoteId) ? "is-selected" : ""
                    }`}
                    key={note.draftNoteId ?? note.id}
                    onClick={(event) =>
                      note.draftNoteId &&
                      onSelectNote(getTrackKey(drumTrack), note.draftNoteId, {
                        additive: event.metaKey || event.ctrlKey || event.shiftKey
                      })
                    }
                  >
                    <strong>{formatNote(note)}</strong>
                    <div>{formatEventTiming(note)}</div>
                    <div className="muted">
                      {drumTrack.provider} | {note.sourceStem ?? "unknown"}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="muted">No visible drum notes yet. / 当前还没有可见的鼓组音符。</p>
            )}
          </div>
        </div>

        <section className="panel inset-panel panel-full">
          <h3>Warnings / 警告</h3>
          <div className="note-list compact-list">
            {activeResult.warnings.length > 0 ? (
              activeResult.warnings.map((warning) => (
                <article className="note-card ornate-card" key={warning}>
                  <div>{formatWarningMessage(warning)}</div>
                </article>
              ))
            ) : (
              <article className="note-card ornate-card">
                <div>No explicit warnings were returned. / 当前结果没有额外警告。</div>
              </article>
            )}
          </div>
        </section>
      </div>
    </details>
  );
}
