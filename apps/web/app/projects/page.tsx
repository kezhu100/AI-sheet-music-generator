"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ChangeEvent, type ReactNode } from "react";
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

function renderBilingualText(text: string): ReactNode {
  const [english, chinese] = text.split("\n");

  if (!chinese) {
    return text;
  }

  return (
    <>
      <span>{english}</span>
      <br />
      <span>{chinese}</span>
    </>
  );
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

function formatProjectAssetSummary(project: ProjectSummary): string {
  return [
    project.assets.hasSourceUpload ? "upload" : null,
    project.assets.hasStems ? "stems" : null,
    project.assets.hasOriginalResult ? "original result" : null,
    project.hasSavedDraft ? `saved draft v${project.draftVersion ?? 1}` : null
  ].filter(Boolean).join(" | ") || "No local assets yet";
}

function formatDraftState(project: ProjectSummary): string {
  if (!project.hasSavedDraft) {
    return "No saved draft yet / 暂无已保存草稿";
  }

  return `Saved draft v${project.draftVersion ?? 1}${
    project.draftSavedAt ? ` · ${new Date(project.draftSavedAt).toLocaleString()}` : ""
  }`;
}

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busyProjectId, setBusyProjectId] = useState<string | null>(null);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
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
    setSelectedProjectIds((currentSelectedProjectIds) =>
      currentSelectedProjectIds.filter((projectId) => projects.some((project) => project.projectId === projectId))
    );
  }, [projects]);

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

  async function deleteProjectsByIds(projectIds: string[]): Promise<void> {
    for (const projectId of projectIds) {
      await deleteProject(projectId);
    }

    setProjects((currentProjects) => currentProjects.filter((currentProject) => !projectIds.includes(currentProject.projectId)));
    setSelectedProjectIds((currentSelectedProjectIds) =>
      currentSelectedProjectIds.filter((projectId) => !projectIds.includes(projectId))
    );
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
      await deleteProjectsByIds([project.projectId]);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Failed to delete the project.");
    } finally {
      setBusyProjectId(null);
    }
  }

  async function handleBulkDeleteProjects(): Promise<void> {
    if (selectedProjectIds.length === 0) {
      return;
    }

    const confirmed = window.confirm(
      `Delete ${selectedProjectIds.length} selected local projects and their saved drafts? / 删除已选择的 ${selectedProjectIds.length} 个本地项目及其已保存草稿？`
    );
    if (!confirmed) {
      return;
    }

    setIsBulkDeleting(true);
    setError(null);
    try {
      await deleteProjectsByIds(selectedProjectIds);
      setSelectedProjectIds([]);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Failed to delete the selected projects.");
    } finally {
      setIsBulkDeleting(false);
    }
  }

  function toggleProjectSelection(projectId: string): void {
    setSelectedProjectIds((currentSelectedProjectIds) =>
      currentSelectedProjectIds.includes(projectId)
        ? currentSelectedProjectIds.filter((currentProjectId) => currentProjectId !== projectId)
        : [...currentSelectedProjectIds, projectId]
    );
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
    <main className="page library-page">
      <section className="hero library-hero">
        <div className="top-nav">
          <Link className="button secondary" href="/">
            Back to Home / 返回首页
          </Link>
        </div>
        <div className="hero-grid library-hero-grid">
          <div className="library-hero-content">
            <h1>{renderBilingualText(copy.project.libraryTitle)}</h1>
            <p>
              Reopen local projects from manifest-backed storage.
              <br />
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
          </div>
          <div className="panel inset-panel hero-sidecard library-onboarding-panel">
            <h3>
              Onboarding
              <br />
              使用提示
            </h3>
            <div className="note-list library-onboarding-grid">
              <article className="note-card">
                <strong>
                  Input Expectations
                  <br />
                  输入建议
                </strong>
                <div className="muted">
                  Use audio that clearly exposes piano and drums when possible.
                  <br />
                  尽量使用钢琴和鼓更清晰的音频素材。
                </div>
              </article>
              <article className="note-card">
                <strong>
                  Draft Model
                  <br />
                  草稿模型
                </strong>
                <div className="muted">
                  Projects keep the original result and the latest saved draft separate.
                  <br />
                  项目会把原始结果与最近保存草稿分开保存。
                </div>
              </article>
              <article className="note-card">
                <strong>
                  Local Portability
                  <br />
                  本地可迁移性
                </strong>
                <div className="muted">
                  Import a folder or ZIP package to create a new local project instance.
                  <br />
                  导入文件夹或 ZIP 项目包时，会创建新的本地项目实例。
                </div>
              </article>
              <article className="note-card">
                <strong>
                  Deferred Items
                  <br />
                  暂缓功能
                </strong>
                <div className="muted">
                  Accounts, public sharing, cloud storage, and job recovery remain out of scope.
                  <br />
                  账号、公开分享、云存储和任务恢复仍不在当前范围内。
                </div>
              </article>
            </div>
          </div>
        </div>
      </section>

      <section className="content-grid">
        {runtimeDiagnostics ? (
          <div className="panel panel-full library-runtime-panel">
            <h2>
              Local Runtime
              <br />
              本地运行状态
            </h2>
            <p className="muted">
              Status / 状态 <span className={getRuntimeSeverityClass(runtimeDiagnostics.severity)}>{runtimeDiagnostics.severity}</span> | {runtimeDiagnostics.summary}
            </p>
          </div>
        ) : null}
        <div className="panel panel-full library-panel">
          <div className="section-heading-row library-section-heading">
            <div>
              <div className="eyebrow">Library / 项目库</div>
              <h2>
                Projects
                <br />
                项目列表
              </h2>
              <p className="muted section-help">
                Open a project to return to the score-first workspace. Project management stays available but secondary.
                <br />
                打开项目后可回到乐谱优先的主工作区。项目管理操作仍然可用，但保持次要层级。
              </p>
            </div>
          </div>
          {selectedProjectIds.length > 0 ? (
            <div className="library-bulk-bar ornate-card">
              <strong>
                {selectedProjectIds.length} selected
                <br />
                已选择 {selectedProjectIds.length} 个项目
              </strong>
              <div className="actions library-bulk-actions">
                <button
                  className="button tertiary danger-button"
                  disabled={isBulkDeleting || busyProjectId !== null}
                  onClick={() => void handleBulkDeleteProjects()}
                  type="button"
                >
                  {isBulkDeleting ? "Deleting Selected... / 正在批量删除..." : "Delete Selected / 批量删除"}
                </button>
              </div>
            </div>
          ) : null}
          {isLoading ? <p className="muted">Loading local project manifests... / 正在加载本地项目清单...</p> : null}
          {error ? <p className="error">{error}</p> : null}
          {!isLoading && !error && projects.length === 0 ? (
            <div className="note-list">
              <article className="note-card">
                <strong>{renderBilingualText(copy.project.libraryEmptyTitle)}</strong>
                <div className="muted">{renderBilingualText(copy.project.libraryEmptyBody)}</div>
              </article>
            </div>
          ) : null}
          {projects.length > 0 ? (
            <div className="project-grid">
              {projects.map((project) => (
                <article className="track-card library-project-card ornate-card" key={project.projectId}>
                  <div className="library-card-header">
                    <label className="library-project-select">
                      <input
                        checked={selectedProjectIds.includes(project.projectId)}
                        disabled={isBulkDeleting || busyProjectId === project.projectId}
                        onChange={() => toggleProjectSelection(project.projectId)}
                        type="checkbox"
                      />
                      <strong>{project.projectName}</strong>
                    </label>
                    <span className="pill">{project.status}</span>
                  </div>
                  <div className="muted">Stage / 阶段: {formatProjectStatus(project)}</div>
                  <div className="muted">Updated / 更新时间: {new Date(project.updatedAt).toLocaleString()}</div>
                  <div className="muted">
                    {project.trackCount != null || project.stemCount != null
                      ? `Tracks / 轨道: ${project.trackCount ?? 0} | Stems / 分轨: ${project.stemCount ?? 0}`
                      : "Tracks and stems appear after a completed result is persisted. / 完成后会显示轨道与分轨。"}
                  </div>
                  <div className="library-card-summary">
                    <strong>Assets / 资产</strong>
                    <div className="muted">{formatProjectAssetSummary(project)}</div>
                  </div>
                  <div className="library-card-summary">
                    <strong>Saved Draft / 已保存草稿</strong>
                    <div className="muted">{formatDraftState(project)}</div>
                  </div>
                  <div className="library-card-summary">
                    <strong>Export Formats / 导出格式</strong>
                    <div className="muted">{project.assets.availableExports.join(", ") || "Not available yet / 暂不可用"}</div>
                  </div>
                  <div className="actions library-primary-actions">
                    <Link className="button" href={project.sharePath}>
                      {copy.project.openAction}
                    </Link>
                  </div>
                  <details className="library-manage-details">
                    <summary>Manage Project / 管理项目</summary>
                    <div className="actions library-manage-actions">
                      <button
                        className="button secondary"
                        disabled={busyProjectId === project.projectId || isBulkDeleting}
                        onClick={() => void handleRenameProject(project)}
                        type="button"
                      >
                        {copy.project.renameAction}
                      </button>
                      <button
                        className="button secondary"
                        disabled={busyProjectId === project.projectId || isBulkDeleting}
                        onClick={() => void handleDuplicateProject(project)}
                        type="button"
                      >
                        {copy.project.duplicateAction}
                      </button>
                      <button
                        className="button tertiary danger-button"
                        disabled={busyProjectId === project.projectId || isBulkDeleting}
                        onClick={() => void handleDeleteProject(project)}
                        type="button"
                      >
                        {copy.project.deleteAction}
                      </button>
                    </div>
                  </details>
                </article>
              ))}
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
