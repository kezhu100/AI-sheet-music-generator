"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { ProjectDetail } from "@ai-sheet-music-generator/shared-types";
import { getProjectDetail } from "../../../lib/api";
import { getUiCopy } from "../../../lib/uiCopy";
import { ProjectWorkspace } from "../../components/ProjectWorkspace";
export default function ProjectDetailPage() {
  const params = useParams<{ projectId: string }>();
  const projectId =
    typeof params?.projectId === "string"
      ? params.projectId
      : Array.isArray(params?.projectId)
        ? params.projectId[0] ?? ""
        : "";
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const copy = getUiCopy();

  useEffect(() => {
    if (!projectId) {
      setProject(null);
      setError("Project id is missing.");
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setError(null);
    setProject(null);
    setIsLoading(true);

    void (async () => {
      try {
        const response = await getProjectDetail(projectId);
        if (!cancelled) {
          setProject(response.project);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load the project detail.");
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
  }, [projectId]);

  if (isLoading) {
    return (
      <main className="page">
        <section className="panel">
          <h1>Loading project...</h1>
          <p className="muted">Reading the filesystem-backed project manifest and persisted assets.</p>
        </section>
      </main>
    );
  }

  if (error || !project) {
    return (
      <main className="page">
        <section className="panel">
          <h1>Project unavailable</h1>
          <p className="error">{error ?? "Project not found."}</p>
          <div className="actions">
            <Link className="button secondary" href="/projects">
              {copy.project.libraryTitle}
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return <ProjectWorkspace initialProjectDetail={project} mode="project" />;
}
