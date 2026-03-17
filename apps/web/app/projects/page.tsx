"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ProjectSummary } from "@ai-sheet-music-generator/shared-types";
import { deleteProject, duplicateProject, getProjects, renameProject } from "../../lib/api";
import { getUiCopy } from "../../lib/uiCopy";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busyProjectId, setBusyProjectId] = useState<string | null>(null);
  const copy = getUiCopy();

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setIsLoading(true);

    void (async () => {
      try {
        const response = await getProjects();
        if (!cancelled) {
          setProjects(response.projects);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load the project library.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleRenameProject(project: ProjectSummary): Promise<void> {
    const nextName = window.prompt("Rename project", project.projectName)?.trim();
    if (!nextName || nextName === project.projectName) {
      return;
    }

    setBusyProjectId(project.projectId);
    setError(null);
    try {
      const response = await renameProject(project.projectId, nextName);
      setProjects((currentProjects) =>
        currentProjects.map((currentProject) =>
          currentProject.projectId === project.projectId ? response.project : currentProject
        )
      );
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Failed to rename the project.");
    } finally {
      setBusyProjectId(null);
    }
  }

  async function handleDuplicateProject(project: ProjectSummary): Promise<void> {
    const nextName = window.prompt("Duplicate project as", `${project.projectName} copy`)?.trim();
    if (nextName === "") {
      return;
    }

    setBusyProjectId(project.projectId);
    setError(null);
    try {
      const response = await duplicateProject(project.projectId, nextName || undefined);
      setProjects((currentProjects) => [response.project, ...currentProjects]);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Failed to duplicate the project.");
    } finally {
      setBusyProjectId(null);
    }
  }

  async function handleDeleteProject(project: ProjectSummary): Promise<void> {
    const confirmed = window.confirm(`Delete "${project.projectName}" and its saved draft?`);
    if (!confirmed) {
      return;
    }

    setBusyProjectId(project.projectId);
    setError(null);
    try {
      await deleteProject(project.projectId);
      setProjects((currentProjects) =>
        currentProjects.filter((currentProject) => currentProject.projectId !== project.projectId)
      );
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Failed to delete the project.");
    } finally {
      setBusyProjectId(null);
    }
  }

  function formatProjectStatus(project: ProjectSummary): string {
    if (project.error) {
      return `Error: ${project.error}`;
    }

    return project.statusMessage ?? project.currentStage ?? project.status;
  }

  return (
    <main className="page">
      <section className="hero">
        <div className="top-nav">
          <Link className="button secondary" href="/">
            Back to upload
          </Link>
        </div>
        <div className="hero-grid">
          <div>
            <h1>{copy.project.libraryTitle}</h1>
            <p>
              Reopen local persisted projects from filesystem-backed manifests. Share routes are stable inside the same deployment,
              but they are not public publishing links and do not bypass missing auth or storage rules.
            </p>
            <div className="pill-row">
              <span className="pill">Manifest-backed listing</span>
              <span className="pill">Immutable original result</span>
              <span className="pill">Saved draft stays separate</span>
              <span className="pill">No accounts yet</span>
            </div>
          </div>
          <div className="panel inset-panel">
            <h3>Onboarding</h3>
            <div className="note-list">
              <article className="note-card">
                <strong>Input expectations</strong>
                <div className="muted">Use audio that clearly exposes piano and drums when possible. Mixed songs still depend heavily on separation quality.</div>
              </article>
              <article className="note-card">
                <strong>Draft model</strong>
                <div className="muted">Projects show the immutable original result plus the latest saved draft when one exists. Current in-session edits are still separate.</div>
              </article>
              <article className="note-card">
                <strong>Deferred items</strong>
                <div className="muted">Accounts, public sharing, databases, cloud storage, and job recovery remain intentionally out of scope for this MVP.</div>
              </article>
            </div>
          </div>
        </div>
      </section>

      <section className="content-grid">
        <div className="panel panel-full">
          <h2>Projects</h2>
          {isLoading ? <p className="muted">Loading local project manifests...</p> : null}
          {error ? <p className="error">{error}</p> : null}
          {!isLoading && !error && projects.length === 0 ? (
            <div className="note-list">
              <article className="note-card">
                <strong>{copy.project.libraryEmptyTitle}</strong>
                <div className="muted">{copy.project.libraryEmptyBody}</div>
              </article>
            </div>
          ) : null}
          {projects.length > 0 ? (
            <div className="project-grid">
              {projects.map((project) => (
                <article className="track-card" key={project.projectId}>
                  <strong>{project.projectName}</strong>
                  <div className="muted">Status: {project.status}</div>
                  <div className="muted">Stage: {formatProjectStatus(project)}</div>
                  <div className="muted">Updated: {new Date(project.updatedAt).toLocaleString()}</div>
                  <div className="muted">
                    {project.trackCount != null || project.stemCount != null
                      ? `Tracks: ${project.trackCount ?? 0} | Stems: ${project.stemCount ?? 0}`
                      : "Tracks and stems appear after a completed result is persisted."}
                  </div>
                  <div>
                    Assets:
                    {" "}
                    {[
                      project.assets.hasSourceUpload ? "upload" : null,
                      project.assets.hasStems ? "stems" : null,
                      project.assets.hasOriginalResult ? "result" : null,
                      project.hasSavedDraft ? `draft v${project.draftVersion ?? 1}` : null
                    ]
                      .filter(Boolean)
                      .join(" | ") || "none"}
                  </div>
                  <div>
                    Draft state:
                    {" "}
                    {project.hasSavedDraft
                      ? `saved v${project.draftVersion ?? 1}${project.draftSavedAt ? ` on ${new Date(project.draftSavedAt).toLocaleString()}` : ""}`
                      : "no saved draft"}
                  </div>
                  <div>Exports: {project.assets.availableExports.join(", ") || "not available yet"}</div>
                  <div className="actions">
                    <Link className="button secondary" href={project.sharePath}>
                      {copy.project.openAction}
                    </Link>
                    <button
                      className="button secondary"
                      disabled={busyProjectId === project.projectId}
                      onClick={() => void handleRenameProject(project)}
                      type="button"
                    >
                      {copy.project.renameAction}
                    </button>
                    <button
                      className="button secondary"
                      disabled={busyProjectId === project.projectId}
                      onClick={() => void handleDuplicateProject(project)}
                      type="button"
                    >
                      {copy.project.duplicateAction}
                    </button>
                    <button
                      className="button secondary danger-button"
                      disabled={busyProjectId === project.projectId}
                      onClick={() => void handleDeleteProject(project)}
                      type="button"
                    >
                      {copy.project.deleteAction}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
