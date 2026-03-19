"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ChangeEvent } from "react";
import type { ProjectSummary, RuntimeDiagnosticsResponse } from "@ai-sheet-music-generator/shared-types";
import {
  deleteProject,
  duplicateProject,
  getProjects,
  getRuntimeDiagnostics,
  importProjectPackage,
  openLocalProject,
  renameProject
} from "../../lib/api";
import { getUiCopy } from "../../lib/uiCopy";

function getRuntimeSeverityClass(severity: RuntimeDiagnosticsResponse["severity"]): string {
  if (severity === "ready") {
    return "pill pill-success";
  }
  if (severity === "degraded") {
    return "pill pill-warning";
  }
  return "pill pill-danger";
}

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busyProjectId, setBusyProjectId] = useState<string | null>(null);
  const [isOpeningLocalProject, setIsOpeningLocalProject] = useState(false);
  const [isImportingPackage, setIsImportingPackage] = useState(false);
  const [runtimeDiagnostics, setRuntimeDiagnostics] = useState<RuntimeDiagnosticsResponse | null>(null);
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

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const response = await getRuntimeDiagnostics();
        if (!cancelled) {
          setRuntimeDiagnostics(response);
        }
      } catch {
        if (!cancelled) {
          setRuntimeDiagnostics(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleRenameProject(project: ProjectSummary): Promise<void> {
    const nextName = window.prompt("Rename project / 重命名项目", project.projectName)?.trim();
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
    const nextName = window.prompt("Duplicate project as / 复制项目为", `${project.projectName} copy`)?.trim();
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
    const confirmed = window.confirm(
      `Delete "${project.projectName}" and its saved draft? / 删除“${project.projectName}”及其已保存草稿？`
    );
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

  async function handleOpenLocalProject(): Promise<void> {
    const sourcePath = window.prompt("Open local project folder path / 打开本地项目文件夹路径");
    if (!sourcePath?.trim()) {
      return;
    }

    setIsOpeningLocalProject(true);
    setError(null);
    try {
      const response = await openLocalProject(sourcePath.trim());
      setProjects((currentProjects) => {
        const remainingProjects = currentProjects.filter(
          (project) => project.projectId !== response.project.projectId
        );
        return [response.project, ...remainingProjects];
      });
      router.push(response.project.sharePath);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Failed to open the local project path.");
    } finally {
      setIsOpeningLocalProject(false);
    }
  }

  async function handleImportPackage(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    setIsImportingPackage(true);
    setError(null);
    try {
      const response = await importProjectPackage(file);
      setProjects((currentProjects) => [
        response.project,
        ...currentProjects.filter((project) => project.projectId !== response.project.projectId)
      ]);
      router.push(response.project.sharePath);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Failed to import the project package.");
    } finally {
      setIsImportingPackage(false);
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
            Back to Home / 返回首页
          </Link>
        </div>
        <div className="hero-grid">
          <div>
            <h1>{copy.project.libraryTitle}</h1>
            <p>
              Reopen local projects from manifest-backed storage. /
              从基于 manifest 的本地存储重新打开项目。
            </p>
            <div className="actions">
              <button
                className="button"
                disabled={isOpeningLocalProject || isImportingPackage}
                onClick={() => void handleOpenLocalProject()}
                type="button"
              >
                {isOpeningLocalProject
                  ? "Opening local project... / 正在打开本地项目..."
                  : "Open Local Project / 打开本地项目"}
              </button>
              <label className="button secondary" style={{ cursor: isImportingPackage ? "default" : "pointer" }}>
                {isImportingPackage
                  ? "Importing package... / 导入中..."
                  : "Import Package / 导入项目包"}
                <input
                  accept=".zip,application/zip"
                  disabled={isImportingPackage || isOpeningLocalProject}
                  hidden
                  onChange={(event) => void handleImportPackage(event)}
                  type="file"
                />
              </label>
            </div>
            <div className="pill-row">
              <span className="pill">Manifest-backed / 基于清单</span>
              <span className="pill">Original stays immutable / 原始结果不变</span>
              <span className="pill">Saved draft stays separate / 草稿独立保存</span>
              <span className="pill">Zip import/export / Zip 导入导出</span>
              <span className="pill">No accounts / 无账户系统</span>
            </div>
          </div>
          <div className="panel inset-panel">
            <h3>Onboarding / 使用提示</h3>
            <div className="note-list">
              <article className="note-card">
                <strong>Input Expectations / 输入建议</strong>
                <div className="muted">
                  Use audio that clearly exposes piano and drums when possible. /
                  尽量使用钢琴和鼓更清晰的音频素材。
                </div>
              </article>
              <article className="note-card">
                <strong>Draft Model / 草稿模型</strong>
                <div className="muted">
                  Projects keep the original result and the latest saved draft separate. /
                  项目会把原始结果与最近保存草稿分开保存。
                </div>
              </article>
              <article className="note-card">
                <strong>Local Portability / 本地可迁移性</strong>
                <div className="muted">
                  Import a folder or zip package to create a new local project instance. /
                  导入文件夹或 zip 项目包时，会创建新的本地项目实例。
                </div>
              </article>
              <article className="note-card">
                <strong>Deferred Items / 暂缓功能</strong>
                <div className="muted">
                  Accounts, public sharing, cloud storage, and job recovery remain out of scope. /
                  账号、公开分享、云存储和任务恢复仍不在当前范围内。
                </div>
              </article>
            </div>
          </div>
        </div>
      </section>

      <section className="content-grid">
        {runtimeDiagnostics ? (
          <div className="panel panel-full">
            <h2>Local Runtime / 本地运行状态</h2>
            <p className="muted">
              Status / 状态 <span className={getRuntimeSeverityClass(runtimeDiagnostics.severity)}>{runtimeDiagnostics.severity}</span> | {runtimeDiagnostics.summary}
            </p>
          </div>
        ) : null}
        <div className="panel panel-full">
          <h2>Projects / 项目列表</h2>
          {isLoading ? <p className="muted">Loading local project manifests... / 正在加载本地项目清单...</p> : null}
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
                  <div className="muted">Status / 状态: {project.status}</div>
                  <div className="muted">Stage / 阶段: {formatProjectStatus(project)}</div>
                  <div className="muted">Updated / 更新时间: {new Date(project.updatedAt).toLocaleString()}</div>
                  <div className="muted">
                    {project.trackCount != null || project.stemCount != null
                      ? `Tracks / 轨道: ${project.trackCount ?? 0} | Stems / 分轨: ${project.stemCount ?? 0}`
                      : "Tracks and stems appear after a completed result is persisted. / 完成后会显示轨道与分轨。"}
                  </div>
                  <div>
                    Assets / 资产: {[
                      project.assets.hasSourceUpload ? "upload" : null,
                      project.assets.hasStems ? "stems" : null,
                      project.assets.hasOriginalResult ? "result" : null,
                      project.hasSavedDraft ? `draft v${project.draftVersion ?? 1}` : null
                    ].filter(Boolean).join(" | ") || "none / 无"}
                  </div>
                  <div>
                    Draft state / 草稿状态: {project.hasSavedDraft
                      ? `saved v${project.draftVersion ?? 1}${project.draftSavedAt ? ` on ${new Date(project.draftSavedAt).toLocaleString()}` : ""}`
                      : "no saved draft / 暂无已保存草稿"}
                  </div>
                  <div>Exports / 导出: {project.assets.availableExports.join(", ") || "not available yet / 暂不可用"}</div>
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
