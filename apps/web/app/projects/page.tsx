"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ProjectSummary } from "@ai-sheet-music-generator/shared-types";
import { getProjects } from "../../lib/api";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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
            <h1>Project Library</h1>
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
                <strong>No projects yet</strong>
                <div className="muted">Create a job from the upload page, then come back here to reopen it from its stable local project route.</div>
              </article>
            </div>
          ) : null}
          {projects.length > 0 ? (
            <div className="project-grid">
              {projects.map((project) => (
                <article className="track-card" key={project.projectId}>
                  <strong>{project.projectName}</strong>
                  <div className="muted">Status: {project.status}</div>
                  <div className="muted">Updated: {new Date(project.updatedAt).toLocaleString()}</div>
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
                  <div>Exports: {project.assets.availableExports.join(", ") || "not available yet"}</div>
                  <div className="actions">
                    <Link className="button secondary" href={project.sharePath}>
                      Open project
                    </Link>
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
