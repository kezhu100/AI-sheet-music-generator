"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
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
  CustomProviderInstallRequest,
  CorrectionSuggestion,
  JobDraftRecord,
  JobRecord,
  NoteEvent,
  ProviderInstallState,
  ProviderPreferences,
  ProjectDetail,
  RuntimeDiagnosticsResponse,
  RuntimeProviderOption,
  RuntimeProviderStatus,
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
  getJobStemAssetUrl,
  getJob,
  getJobDraft,
  getProviderInstallStatus,
  getRuntimeDiagnostics,
  installCustomProvider,
  installEnhancedProvider,
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

const DEFAULT_PROVIDER_PREFERENCES: ProviderPreferences = {
  sourceSeparation: "auto",
  pianoTranscription: "auto",
  drumTranscription: "auto"
};

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

function getRuntimeProvider(
  diagnostics: RuntimeDiagnosticsResponse | null,
  key: RuntimeProviderStatus["key"]
): RuntimeProviderStatus | null {
  return diagnostics?.providers.find((provider) => provider.key === key) ?? null;
}

function buildCreateJobPayload(uploadId: string, providerPreferences: ProviderPreferences) {
  const hasExplicitPreference = Object.values(providerPreferences).some((value) => value && value !== "auto");

  return hasExplicitPreference ? { uploadId, providerPreferences } : { uploadId };
}

function buildRuntimeOptionInstallKey(option: RuntimeProviderOption): string {
  return `${option.category}:${option.id}`;
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
}

interface RuntimeProviderInstallUiState {
  state: ProviderInstallState | "starting";
  installId?: string;
  message: string;
  failureReason?: string;
  actionableSteps: string[];
  preferenceKey: keyof ProviderPreferences;
  useAfterInstall: boolean;
  targetProvider: NonNullable<ProviderPreferences[keyof ProviderPreferences]>;
}

interface RuntimeUsedProviderSummaryItem {
  key: keyof ProviderPreferences;
  label: string;
  requestedProvider: string | null;
  requestedLabel: string;
  requestRecorded: boolean;
  usedProvider: string | null;
  usedLabel: string;
  fallback: boolean;
  autoPickedEnhanced: boolean;
}

interface RuntimeCustomProviderInstallUiState {
  state: ProviderInstallState | "starting";
  installId?: string;
  message: string;
  failureReason?: string;
  actionableSteps: string[];
  targetManifestUrl: string;
}

function getFirstActionableStep(steps: string[]): string | null {
  if (steps.length === 0) {
    return null;
  }

  return steps[0]?.trim() || null;
}

const PROVIDER_NAME_TO_OPTION_ID: Record<string, string> = {
  "local-development-separation": "development-copy",
  "demucs-separation": "demucs",
  "heuristic-wav-piano-provider": "heuristic",
  "basic-pitch-piano-provider": "basic-pitch",
  "heuristic-wav-drum-provider": "heuristic",
  "demucs-onset-drum-provider": "demucs-drums",
  ml: "demucs-drums",
  madmom: "demucs-drums"
};

function normalizeUsedProviderId(providerName: string | null): string | null {
  if (!providerName) {
    return null;
  }

  return PROVIDER_NAME_TO_OPTION_ID[providerName] ?? providerName;
}

function getCompactInstallMessage(message: string): string {
  const trimmed = message.trim();
  if (!trimmed) {
    return "Check the local manifest path and try again. / 检查本地 manifest 路径后重试。";
  }

  if (trimmed.length <= 140) {
    return trimmed;
  }

  const sentence = trimmed.split(/[.!?]\s/)[0]?.trim();
  if (sentence && sentence.length <= 140) {
    return `${sentence}.`;
  }

  return `${trimmed.slice(0, 137).trimEnd()}...`;
}

function getProviderLayerLabel(option: RuntimeProviderOption): string {
  return option.optionalEnhanced ? "Official enhanced / 官方增强" : "Built-in / 内置";
}

function getProviderInstallFailureNote(option: RuntimeProviderOption, failed: boolean): string | null {
  if (!failed || option.id !== "demucs-drums") {
    return null;
  }

  return "Demucs Drums needs the local Demucs runtime. Built-in drum transcription remains available. / Demucs Drums 需要本地 Demucs 运行时；内置鼓转谱仍可作为稳定回退。";
}

interface RuntimeCustomProviderSectionProps {
  provider: RuntimeProviderStatus;
}

function RuntimeCustomProviderSection({ provider }: RuntimeCustomProviderSectionProps) {
  if (provider.customProviders.length === 0) {
    return (
      <div className="runtime-custom-provider-list">
        <article className="runtime-custom-card">
          <strong>Custom registered providers / 自定义已注册 providers</strong>
          <div className="muted">
            No custom registrations yet. Not part of Auto or execution in this step.
            <br />
            当前还没有已注册项目；本阶段仅提供注册与诊断展示。
          </div>
        </article>
      </div>
    );
  }

  return (
    <div className="runtime-custom-provider-list">
      {provider.customProviders.map((customProvider) => (
        <article className="runtime-custom-card" key={`${provider.key}:${customProvider.providerId}`}>
          <strong>{customProvider.displayName}</strong>
          <div className="runtime-provider-kind runtime-provider-kind-custom">Custom registered / 已注册自定义</div>
          <div className="muted">
            {customProvider.providerId} · v{customProvider.providerVersion}
          </div>
          <div className="muted">{customProvider.statusText}</div>
          <div className="muted">
            Manifest URL: {customProvider.manifestUrl}
            <br />
            Asset count: {customProvider.assetCount} · Execution not enabled in this step.
          </div>
        </article>
      ))}
    </div>
  );
}

interface RuntimeProviderPreferenceFieldProps {
  fieldName: string;
  title: string;
  titleZh: string;
  preferenceKey: keyof ProviderPreferences;
  currentValue: string | undefined;
  selectedProviderLabel?: string;
  options?: RuntimeProviderStatus["options"];
  onChange: (value: string) => void;
  installStates: Record<string, RuntimeProviderInstallUiState>;
  onInstall: (
    preferenceKey: keyof ProviderPreferences,
    option: RuntimeProviderOption,
    options: { useAfterInstall: boolean; forceReinstall: boolean }
  ) => void;
}

function RuntimeProviderPreferenceField({
  fieldName,
  title,
  titleZh,
  preferenceKey,
  currentValue,
  selectedProviderLabel,
  options,
  onChange,
  installStates,
  onInstall
}: RuntimeProviderPreferenceFieldProps) {
  function handleInlineInstallAction(
    event: MouseEvent<HTMLButtonElement>,
    option: RuntimeProviderOption,
    useAfterInstall: boolean,
    forceReinstall: boolean
  ): void {
    event.preventDefault();
    event.stopPropagation();
    onInstall(preferenceKey, option, { useAfterInstall, forceReinstall });
  }

  return (
    <fieldset className="runtime-option-group">
      <legend>
        {title}
        <br />
        {titleZh}
      </legend>
      <div className="runtime-option-list">
        <label className={`runtime-option-card ${currentValue === "auto" ? "is-selected" : ""}`}>
          <input
            checked={currentValue === "auto"}
            name={fieldName}
            type="radio"
            value="auto"
            onChange={() => onChange("auto")}
          />
          <span className="runtime-option-label">Auto (Recommended) / 自动（推荐）</span>
          <span className="muted">
            {selectedProviderLabel
              ? `Current local default: ${selectedProviderLabel} / 当前本地默认值：${selectedProviderLabel}`
              : "Use the current local default. / 使用当前本地默认设置。"}
          </span>
        </label>
        {options?.map((option) => {
          const installKey = buildRuntimeOptionInstallKey(option);
          const installState = installStates[installKey];
          const isInstalling = installState?.state === "starting" || installState?.state === "running";
          const installFailed = installState?.state === "failed";
          const installCompleted = installState?.state === "completed";
          const showInstallAction = option.optionalEnhanced && !option.installed;
          const installButtonDisabled = isInstalling || !option.installable;
          const failedGuidance = getFirstActionableStep(installState?.actionableSteps ?? []);
          const failedNote = getProviderInstallFailureNote(option, Boolean(installFailed));
          const optionGuidance = getFirstActionableStep(option.actionableSteps);

          return (
            <label
              className={`runtime-option-card ${currentValue === option.provider ? "is-selected" : ""} ${!option.available ? "is-disabled" : ""}`}
              key={`${option.category}:${option.provider}`}
            >
              <input
                checked={currentValue === option.provider}
                disabled={!option.available || isInstalling}
                name={fieldName}
                type="radio"
                value={option.provider}
                onChange={() => onChange(option.provider)}
              />
              <span className="runtime-option-label">
                {option.label}
                <span
                  className={`runtime-provider-kind ${
                    option.optionalEnhanced ? "runtime-provider-kind-official" : "runtime-provider-kind-built-in"
                  }`}
                >
                  {getProviderLayerLabel(option)}
                </span>
                {option.recommended ? " · Recommended / 推荐" : ""}
                {!option.available && option.optionalEnhanced ? " · Optional install / 可选安装" : ""}
              </span>
              <span className="muted">{option.statusText || option.detail}</span>
              {option.optionalEnhanced ? <span className="muted runtime-option-help">{option.helpText}</span> : null}
              {showInstallAction ? (
                <div className="runtime-option-actions">
                  <button
                    className="button secondary button-tiny"
                    type="button"
                    disabled={installButtonDisabled}
                    onClick={(event) => handleInlineInstallAction(event, option, false, Boolean(installFailed))}
                  >
                    {installFailed ? "Retry / 重试" : "Install / 安装"}
                  </button>
                  <button
                    className="button tertiary button-tiny"
                    type="button"
                    disabled={installButtonDisabled}
                    onClick={(event) => handleInlineInstallAction(event, option, true, Boolean(installFailed))}
                  >
                    {installFailed ? "Retry & Use / 重试并使用" : "Install & Use / 安装并使用"}
                  </button>
                </div>
              ) : null}
              {isInstalling ? (
                <span className="muted runtime-install-status">
                  Installing official provider... / 正在安装官方 provider：
                  {installState?.message ?? "Preparing install."}
                </span>
              ) : null}
              {installCompleted && option.installed ? (
                <span className="muted runtime-install-status runtime-install-success">
                  Installed. Available for selection. / 已安装，可直接选择。
                </span>
              ) : null}
              {installFailed ? (
                <>
                  <span className="muted runtime-install-status runtime-install-error">
                    {installState.message}
                    {failedGuidance ? ` ${failedGuidance}` : ""}
                  </span>
                  {failedNote ? <span className="muted runtime-install-status">{failedNote}</span> : null}
                </>
              ) : null}
              {showInstallAction && !option.installable && option.missingReason ? (
                <span className="muted runtime-install-status runtime-install-error">
                  {option.missingReason}
                  {optionGuidance ? ` ${optionGuidance}` : ""}
                </span>
              ) : null}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
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
    providerPreferences: projectDetail.providerPreferences ?? undefined,
    result: projectDetail.originalResult ?? undefined,
    error: projectDetail.error ?? undefined
  };
}

function toEditableProviderPreferences(
  providerPreferences?: ProviderPreferences | null
): ProviderPreferences {
  return {
    sourceSeparation: providerPreferences?.sourceSeparation ?? "auto",
    pianoTranscription: providerPreferences?.pianoTranscription ?? "auto",
    drumTranscription: providerPreferences?.drumTranscription ?? "auto"
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
  const [museScoreHandoffMessage, setMuseScoreHandoffMessage] = useState<string | null>(null);
  const [runtimeDiagnostics, setRuntimeDiagnostics] = useState<RuntimeDiagnosticsResponse | null>(null);
  const [runtimeDiagnosticsError, setRuntimeDiagnosticsError] = useState<string | null>(null);
  const [isRefreshingRuntimeDiagnostics, setIsRefreshingRuntimeDiagnostics] = useState(false);
  const [providerPreferences, setProviderPreferences] = useState<ProviderPreferences>(() =>
    toEditableProviderPreferences(initialProjectDetail?.providerPreferences ?? null)
  );
  const [providerInstallStates, setProviderInstallStates] = useState<Record<string, RuntimeProviderInstallUiState>>({});
  const [isCustomProviderFormOpen, setIsCustomProviderFormOpen] = useState(false);
  const [customProviderManifestUrl, setCustomProviderManifestUrl] = useState("");
  const [customProviderInstallState, setCustomProviderInstallState] = useState<RuntimeCustomProviderInstallUiState | null>(null);
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

  async function refreshRuntimeDiagnostics(options?: { quiet?: boolean }): Promise<RuntimeDiagnosticsResponse | null> {
    const quiet = options?.quiet ?? false;
    if (!quiet) {
      setIsRefreshingRuntimeDiagnostics(true);
    }

    try {
      const response = await getRuntimeDiagnostics();
      setRuntimeDiagnostics(response);
      setRuntimeDiagnosticsError(null);
      return response;
    } catch (loadError) {
      setRuntimeDiagnosticsError(
        loadError instanceof Error ? loadError.message : "Failed to load local runtime diagnostics."
      );
      return null;
    } finally {
      if (!quiet) {
        setIsRefreshingRuntimeDiagnostics(false);
      }
    }
  }

  useEffect(() => {
    setProjectDetail(initialProjectDetail);
    setJob(buildJobFromProjectDetail(initialProjectDetail));
    setSavedDraft(initialProjectDetail?.savedDraft ?? null);
    setProviderPreferences(toEditableProviderPreferences(initialProjectDetail?.providerPreferences ?? null));
    setSuggestions([]);
    setSuggestionsStale(false);
    setLastAnalyzedDraftSignature(null);
    lastDraftJobIdRef.current = null;
  }, [initialProjectDetail]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const response = await refreshRuntimeDiagnostics({ quiet: true });
      if (!response || cancelled) {
        return;
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

  const sourceRuntimeProvider = useMemo(
    () => getRuntimeProvider(runtimeDiagnostics, "source-separation"),
    [runtimeDiagnostics]
  );
  const pianoRuntimeProvider = useMemo(
    () => getRuntimeProvider(runtimeDiagnostics, "piano-transcription"),
    [runtimeDiagnostics]
  );
  const drumRuntimeProvider = useMemo(
    () => getRuntimeProvider(runtimeDiagnostics, "drum-transcription"),
    [runtimeDiagnostics]
  );
  const providerOptionLookup = useMemo(() => {
    return {
      source: new Map((sourceRuntimeProvider?.options ?? []).map((option) => [option.provider, option])),
      piano: new Map((pianoRuntimeProvider?.options ?? []).map((option) => [option.provider, option])),
      drum: new Map((drumRuntimeProvider?.options ?? []).map((option) => [option.provider, option]))
    };
  }, [sourceRuntimeProvider?.options, pianoRuntimeProvider?.options, drumRuntimeProvider?.options]);
  const persistedProviderPreferences = useMemo(
    () => job?.providerPreferences ?? projectDetail?.providerPreferences ?? null,
    [job?.providerPreferences, projectDetail?.providerPreferences]
  );
  const runtimeUsedProviderSummary = useMemo<RuntimeUsedProviderSummaryItem[]>(() => {
    if (!activeResult) {
      return [];
    }

    const sourceUsedProvider = normalizeUsedProviderId(activeResult.stems[0]?.provider ?? null);
    const pianoUsedProvider = normalizeUsedProviderId(
      activeResult.tracks.find((track) => track.instrument === "piano")?.provider ?? null
    );
    const drumUsedProvider = normalizeUsedProviderId(
      activeResult.tracks.find((track) => track.instrument === "drums")?.provider ?? null
    );

    function buildSummaryItem(
      key: keyof ProviderPreferences,
      label: string,
      usedProvider: string | null,
      optionMap: Map<string, RuntimeProviderOption>
    ): RuntimeUsedProviderSummaryItem {
      const requestedProvider = persistedProviderPreferences?.[key] ?? null;
      const requestedOption =
        requestedProvider && requestedProvider !== "auto" ? optionMap.get(requestedProvider) : undefined;
      const usedOption = usedProvider ? optionMap.get(usedProvider) : undefined;
      const requestRecorded = requestedProvider != null;
      const fallback = requestRecorded && requestedProvider !== "auto" && usedProvider != null && usedProvider !== requestedProvider;
      const autoPickedEnhanced = requestedProvider === "auto" && Boolean(usedOption?.optionalEnhanced);

      return {
        key,
        label,
        requestedProvider,
        requestedLabel: requestRecorded
          ? requestedOption?.label ?? (requestedProvider === "auto" ? "Auto" : requestedProvider)
          : "Not recorded",
        requestRecorded,
        usedProvider,
        usedLabel: usedOption?.label ?? usedProvider ?? "unknown",
        fallback,
        autoPickedEnhanced
      };
    }

    return [
      buildSummaryItem("sourceSeparation", "Source", sourceUsedProvider, providerOptionLookup.source),
      buildSummaryItem("pianoTranscription", "Piano", pianoUsedProvider, providerOptionLookup.piano),
      buildSummaryItem("drumTranscription", "Drums", drumUsedProvider, providerOptionLookup.drum)
    ];
  }, [activeResult, persistedProviderPreferences, providerOptionLookup]);
  const runtimeUsedFallbackDetected = useMemo(() => {
    if (!activeResult) {
      return false;
    }

    return activeResult.warnings.some((warning) => {
      const normalizedWarning = warning.toLowerCase();
      return normalizedWarning.includes("fell back") || normalizedWarning.includes("fallback");
    });
  }, [activeResult]);

  useEffect(() => {
    const trackedInstalls = Object.entries(providerInstallStates).filter(
      ([, installState]) =>
        Boolean(installState.installId) && (installState.state === "starting" || installState.state === "running")
    );

    if (trackedInstalls.length === 0) {
      return;
    }

    let cancelled = false;

    const pollInstallStatuses = async (): Promise<void> => {
      const statusResults = await Promise.all(
        trackedInstalls.map(async ([installKey, installState]) => {
          if (!installState.installId) {
            return null;
          }

          try {
            const response = await getProviderInstallStatus(installState.installId);
            return { installKey, installState, response };
          } catch (statusError) {
            return {
              installKey,
              installState,
              error: statusError instanceof Error ? statusError.message : "Failed to load install status."
            };
          }
        })
      );

      if (cancelled) {
        return;
      }

      let shouldRefreshRuntime = false;
      setProviderInstallStates((currentStates) => {
        const nextStates = { ...currentStates };

        for (const result of statusResults) {
          if (!result) {
            continue;
          }

          if ("error" in result) {
            nextStates[result.installKey] = {
              ...result.installState,
              state: "failed",
              message: result.error ?? "Install status check failed.",
              failureReason: "status_poll_failed",
              actionableSteps: ["Retry install from this option."]
            };
            continue;
          }

          const install = result.response.install;
          nextStates[result.installKey] = {
            state: install.state,
            installId: install.installId ?? undefined,
            message: install.message,
            failureReason: install.failureReason ?? undefined,
            actionableSteps: install.actionableSteps,
            preferenceKey: result.installState.preferenceKey,
            useAfterInstall: result.installState.useAfterInstall,
            targetProvider: result.installState.targetProvider
          };

          if (install.state === "completed") {
            shouldRefreshRuntime = true;
          }
        }

        return nextStates;
      });

      for (const result of statusResults) {
        if (!result || "error" in result) {
          continue;
        }
        if (result.response.install.state === "completed" && result.installState.useAfterInstall) {
          setProviderPreferences((currentPreferences) => ({
            ...currentPreferences,
            [result.installState.preferenceKey]: result.installState.targetProvider
          }));
        }
      }

      if (shouldRefreshRuntime) {
        await refreshRuntimeDiagnostics({ quiet: true });
      }
    };

    void pollInstallStatuses();
    const intervalId = window.setInterval(() => {
      void pollInstallStatuses();
    }, 1500);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [providerInstallStates]);

  useEffect(() => {
    if (
      !customProviderInstallState?.installId ||
      (customProviderInstallState.state !== "starting" && customProviderInstallState.state !== "running")
    ) {
      return;
    }

    let cancelled = false;

    const pollCustomInstallStatus = async (): Promise<void> => {
      try {
        const response = await getProviderInstallStatus(customProviderInstallState.installId ?? "");
        if (cancelled) {
          return;
        }

        const install = response.install;
        setCustomProviderInstallState((currentState) => {
          if (!currentState) {
            return currentState;
          }

          return {
            state: install.state,
            installId: install.installId ?? undefined,
            message: getCompactInstallMessage(install.message),
            failureReason: install.failureReason ?? undefined,
            actionableSteps: install.actionableSteps,
            targetManifestUrl: currentState.targetManifestUrl
          };
        });

        if (install.state === "completed") {
          await refreshRuntimeDiagnostics({ quiet: true });
        }
      } catch (statusError) {
        if (cancelled) {
          return;
        }

        setCustomProviderInstallState((currentState) => {
          if (!currentState) {
            return currentState;
          }

          return {
            ...currentState,
            state: "failed",
            message: "Could not load custom install status. / 无法加载自定义安装状态。",
            failureReason: "status_poll_failed",
            actionableSteps: ["Retry with the same local file:// manifest URL."]
          };
        });
        setError(statusError instanceof Error ? statusError.message : "Failed to load custom install status.");
      }
    };

    void pollCustomInstallStatus();
    const intervalId = window.setInterval(() => {
      void pollCustomInstallStatus();
    }, 1500);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [customProviderInstallState?.installId, customProviderInstallState?.state]);

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
  const auditionStemCards = useMemo(() => {
    if (!job?.id || !activeResult) {
      return [];
    }

    return [
      { label: "Piano stem / 钢琴分轨", stem: activeResult.stems.find((stem) => stem.instrumentHint === "piano") },
      { label: "Drum stem / 鼓组分轨", stem: activeResult.stems.find((stem) => stem.instrumentHint === "drums") }
    ]
      .filter((item) => item.stem != null)
      .map((item) => ({
        label: item.label,
        stem: item.stem!,
        url: getJobStemAssetUrl(job.id, item.stem!.stemName)
      }));
  }, [activeResult, job?.id]);

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
    setMuseScoreHandoffMessage(null);
    setLastAnalyzedDraftSignature(null);
    lastDraftJobIdRef.current = null;
    clearEditableState();

    try {
      const uploadResponse = await uploadAudio(selectedFile);
      setUpload(uploadResponse);
      setIsUploading(false);
      setIsCreatingJob(true);
      const jobResponse = await createJob(buildCreateJobPayload(uploadResponse.upload.uploadId, providerPreferences));
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
      triggerBlobDownload(midiBlob, `${downloadBaseName}-${modeName}.mid`);
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

  async function handleMusicXmlExport(modeName: "original" | "draft"): Promise<boolean> {
    if (!job?.result) {
      setError("Complete a job before exporting MusicXML.");
      return false;
    }

    if (modeName === "draft" && !activeResult) {
      setError("Draft result is not available yet.");
      return false;
    }

    setError(null);
    if (modeName === "original") {
      setIsExportingOriginalMusicXml(true);
    } else {
      setIsExportingDraftMusicXml(true);
    }

    try {
      const musicXmlBlob = await downloadMusicXmlExport(job.id, modeName === "draft" ? getCurrentDraftResult() : undefined);
      const fileName = `${downloadBaseName}-${modeName}.musicxml`;
      triggerBlobDownload(musicXmlBlob, fileName);
      setMuseScoreHandoffMessage(
        `Downloaded ${fileName}. Open it in MuseScore for final notation polishing. / 已下载 ${fileName}，请在 MuseScore 中打开并完成最终排版润色。`
      );
      return true;
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Failed to export MusicXML.");
      return false;
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

  function handleProviderPreferenceChange<K extends keyof ProviderPreferences>(
    key: K,
    value: NonNullable<ProviderPreferences[K]>
  ): void {
    setProviderPreferences((currentPreferences) => ({
      ...currentPreferences,
      [key]: value
    }));
  }

  async function handleInstallProviderOption(
    preferenceKey: keyof ProviderPreferences,
    option: RuntimeProviderOption,
    installOptions: { useAfterInstall: boolean; forceReinstall: boolean }
  ): Promise<void> {
    const installKey = buildRuntimeOptionInstallKey(option);
    setProviderInstallStates((currentStates) => ({
      ...currentStates,
      [installKey]: {
        state: "starting",
        message: `Preparing ${option.displayName}.`,
        failureReason: undefined,
        actionableSteps: [],
        preferenceKey,
        useAfterInstall: installOptions.useAfterInstall,
        targetProvider: option.provider as NonNullable<ProviderPreferences[keyof ProviderPreferences]>
      }
    }));

    try {
      const response = await installEnhancedProvider(option.id, {
        forceReinstall: installOptions.forceReinstall
      });

      if (response.status === "failed") {
        setProviderInstallStates((currentStates) => ({
          ...currentStates,
          [installKey]: {
            state: "failed",
            message: response.message,
            failureReason: response.failureReason ?? undefined,
            actionableSteps: response.actionableSteps,
            preferenceKey,
            useAfterInstall: installOptions.useAfterInstall,
            targetProvider: option.provider as NonNullable<ProviderPreferences[keyof ProviderPreferences]>
          }
        }));
        return;
      }

      if (response.status === "completed") {
        setProviderInstallStates((currentStates) => ({
          ...currentStates,
          [installKey]: {
            state: "completed",
            message: response.message,
            failureReason: undefined,
            actionableSteps: response.actionableSteps,
            preferenceKey,
            useAfterInstall: installOptions.useAfterInstall,
            targetProvider: option.provider as NonNullable<ProviderPreferences[keyof ProviderPreferences]>
          }
        }));
        if (installOptions.useAfterInstall) {
          setProviderPreferences((currentPreferences) => ({
            ...currentPreferences,
            [preferenceKey]: option.provider as NonNullable<ProviderPreferences[keyof ProviderPreferences]>
          }));
        }
        await refreshRuntimeDiagnostics({ quiet: true });
        return;
      }

      setProviderInstallStates((currentStates) => ({
        ...currentStates,
        [installKey]: {
          state: "running",
          installId: response.installId ?? undefined,
          message: response.message,
          failureReason: undefined,
          actionableSteps: response.actionableSteps,
          preferenceKey,
          useAfterInstall: installOptions.useAfterInstall,
          targetProvider: option.provider as NonNullable<ProviderPreferences[keyof ProviderPreferences]>
        }
      }));
    } catch (installError) {
      setProviderInstallStates((currentStates) => ({
        ...currentStates,
        [installKey]: {
          state: "failed",
          message: installError instanceof Error ? installError.message : `Failed to install ${option.displayName}.`,
          failureReason: "install_request_failed",
          actionableSteps: ["Retry install from this option."],
          preferenceKey,
          useAfterInstall: installOptions.useAfterInstall,
          targetProvider: option.provider as NonNullable<ProviderPreferences[keyof ProviderPreferences]>
        }
      }));
    }
  }

  function handleCancelCustomProviderForm(): void {
    setIsCustomProviderFormOpen(false);
    setCustomProviderManifestUrl("");
  }

  async function handleCustomProviderInstall(): Promise<void> {
    const manifestUrl = customProviderManifestUrl.trim();
    if (!manifestUrl) {
      setCustomProviderInstallState({
        state: "failed",
        message: "Enter a local file:// manifest URL. / 请输入本地 file:// manifest URL。",
        failureReason: "manifest_url_required",
        actionableSteps: ["Use a local file://...json manifest URL only."],
        targetManifestUrl: ""
      });
      return;
    }

    setCustomProviderInstallState({
      state: "starting",
      message: "Preparing custom provider registration. / 正在准备自定义 provider 注册。",
      failureReason: undefined,
      actionableSteps: [],
      targetManifestUrl: manifestUrl
    });

    try {
      const payload: CustomProviderInstallRequest = {
        sourceType: "manifest_url",
        manifestUrl
      };
      const response = await installCustomProvider(payload);

      if (response.status === "failed") {
        setCustomProviderInstallState({
          state: "failed",
          message: getCompactInstallMessage(response.message),
          failureReason: response.failureReason ?? undefined,
          actionableSteps: response.actionableSteps,
          targetManifestUrl: manifestUrl
        });
        return;
      }

      if (response.status === "completed") {
        setCustomProviderInstallState({
          state: "completed",
          message: getCompactInstallMessage(response.message),
          failureReason: undefined,
          actionableSteps: response.actionableSteps,
          targetManifestUrl: manifestUrl
        });
        await refreshRuntimeDiagnostics({ quiet: true });
        setIsCustomProviderFormOpen(false);
        return;
      }

      setCustomProviderInstallState({
        state: "running",
        installId: response.installId ?? undefined,
        message: getCompactInstallMessage(response.message),
        failureReason: undefined,
        actionableSteps: response.actionableSteps,
        targetManifestUrl: manifestUrl
      });
      setIsCustomProviderFormOpen(false);
    } catch (installError) {
      setCustomProviderInstallState({
        state: "failed",
        message: "Custom provider registration failed. / 自定义 provider 注册失败。",
        failureReason: "install_request_failed",
        actionableSteps: ["Use a local file://...json manifest URL and try again."],
        targetManifestUrl: manifestUrl
      });
      setError(installError instanceof Error ? installError.message : "Failed to register the custom provider.");
    }
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
    <main className={`page workspace-page ${mode === "home" ? "home-workspace-page" : "project-workspace-page"}`}>
      <section className={`hero product-hero ${mode === "home" ? "hero-home-fantasy" : "hero-workspace-fantasy"}`}>
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
              A local-first AI transcription workspace for review, cleanup, and export.
              <br />
              一个本地优先的创作工作区，把音频整理成可编辑的草稿乐谱。
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
            <h2>
              Start a Project
              <br />
              开始项目
            </h2>
            <div className="upload-form">
              <div className="upload-box ornate-card">
                <label htmlFor="audio-file">Audio File / 音频文件</label>
                <input
                  id="audio-file"
                  type="file"
                  accept="audio/*"
                  onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
                />
                <p className="muted">
                  Upload a full mix or an isolated stem.
                  <br />
                  可以上传完整混音，也可以上传单独音轨素材。
                </p>
              </div>
              <details className="runtime-options-panel ornate-card">
                <summary>Advanced Runtime Options / 高级运行选项</summary>
                <div className="runtime-options-body">
                  <p className="muted">
                    Built-in providers stay ready by default. Official enhanced providers are optional, and custom providers only register for diagnostics in this step.
                    <br />
                    内置 provider 默认即开即用；官方增强 provider 可按需安装；自定义 provider 在本阶段仅用于注册与诊断展示。
                  </p>
                  <div className="runtime-options-toolbar">
                    <button
                      className="button tertiary button-tiny"
                      type="button"
                      disabled={isRefreshingRuntimeDiagnostics}
                      onClick={() => void refreshRuntimeDiagnostics()}
                    >
                      {isRefreshingRuntimeDiagnostics ? "Refreshing... / 刷新中..." : "Refresh Availability / 刷新可用性"}
                    </button>
                  </div>
                  <div className="runtime-option-grid">
                    <RuntimeProviderPreferenceField
                      currentValue={providerPreferences.sourceSeparation}
                      fieldName="source-separation-provider"
                      preferenceKey="sourceSeparation"
                      onChange={(value) => handleProviderPreferenceChange("sourceSeparation", value as "auto" | "development-copy" | "demucs")}
                      onInstall={(preferenceKey, option, options) =>
                        void handleInstallProviderOption(preferenceKey, option, options)
                      }
                      installStates={providerInstallStates}
                      options={sourceRuntimeProvider?.options}
                      selectedProviderLabel={sourceRuntimeProvider?.selectedProviderLabel}
                      title="Source Separation"
                      titleZh="源分离"
                    />
                    <RuntimeProviderPreferenceField
                      currentValue={providerPreferences.pianoTranscription}
                      fieldName="piano-transcription-provider"
                      preferenceKey="pianoTranscription"
                      onChange={(value) => handleProviderPreferenceChange("pianoTranscription", value as "auto" | "heuristic" | "basic-pitch")}
                      onInstall={(preferenceKey, option, options) =>
                        void handleInstallProviderOption(preferenceKey, option, options)
                      }
                      installStates={providerInstallStates}
                      options={pianoRuntimeProvider?.options}
                      selectedProviderLabel={pianoRuntimeProvider?.selectedProviderLabel}
                      title="Piano Transcription"
                      titleZh="钢琴转谱"
                    />
                    <RuntimeProviderPreferenceField
                      currentValue={providerPreferences.drumTranscription}
                      fieldName="drum-transcription-provider"
                      preferenceKey="drumTranscription"
                      onChange={(value) => handleProviderPreferenceChange("drumTranscription", value as "auto" | "heuristic" | "demucs-drums")}
                      onInstall={(preferenceKey, option, options) =>
                        void handleInstallProviderOption(preferenceKey, option, options)
                      }
                      installStates={providerInstallStates}
                      options={drumRuntimeProvider?.options}
                      selectedProviderLabel={drumRuntimeProvider?.selectedProviderLabel}
                      title="Drum Transcription"
                      titleZh="鼓轨转谱"
                    />
                  </div>
                  <section className="runtime-custom-section">
                    <div className="runtime-custom-header">
                      <div>
                        <strong>Register custom provider / 注册自定义 provider</strong>
                        <div className="muted runtime-custom-help">
                          Local manifest URL only. Registers a diagnostic entry, not an execution-ready provider.
                          <br />
                          仅支持本地 manifest URL，且只接受本地 `file://...json` 路径。本阶段仅用于注册与诊断展示。
                        </div>
                      </div>
                      <button
                        className="button tertiary button-tiny"
                        type="button"
                        onClick={() => setIsCustomProviderFormOpen((currentOpen) => !currentOpen)}
                      >
                        {isCustomProviderFormOpen ? "Close / 收起" : "Register Custom Provider / 注册自定义 provider"}
                      </button>
                    </div>
                    {isCustomProviderFormOpen ? (
                      <div className="runtime-custom-form ornate-card">
                        <div className="field">
                          <label htmlFor="custom-provider-manifest-url">Local manifest URL only / 仅限本地 manifest URL</label>
                          <input
                            id="custom-provider-manifest-url"
                            placeholder="file:///C:/path/to/provider-manifest.json"
                            type="text"
                            value={customProviderManifestUrl}
                            onChange={(event) => setCustomProviderManifestUrl(event.target.value)}
                          />
                        </div>
                        <div className="actions">
                          <button className="button secondary button-tiny" type="button" onClick={() => void handleCustomProviderInstall()}>
                            Confirm / 确认
                          </button>
                          <button className="button tertiary button-tiny" type="button" onClick={handleCancelCustomProviderForm}>
                            Cancel / 取消
                          </button>
                        </div>
                      </div>
                    ) : null}
                    {customProviderInstallState ? (
                      <article
                        className={`runtime-custom-status ${
                          customProviderInstallState.state === "failed"
                            ? "is-error"
                            : customProviderInstallState.state === "completed"
                              ? "is-success"
                              : ""
                        }`}
                      >
                        <strong>
                          {customProviderInstallState.state === "completed"
                            ? "Registered for diagnostics / 已注册用于诊断"
                            : customProviderInstallState.state === "failed"
                              ? "Registration failed / 注册失败"
                              : "Registering... / 正在注册..."}
                        </strong>
                        <div className="muted">{customProviderInstallState.message}</div>
                        <div className="muted">Not used by Auto or the main pipeline in this step. / 本阶段不会进入 Auto 或主流水线执行。</div>
                        {customProviderInstallState.targetManifestUrl ? (
                          <div className="muted">Manifest URL: {customProviderInstallState.targetManifestUrl}</div>
                        ) : null}
                        {getFirstActionableStep(customProviderInstallState.actionableSteps) ? (
                          <div className="muted">
                            Next step: {getFirstActionableStep(customProviderInstallState.actionableSteps)}
                          </div>
                        ) : null}
                      </article>
                    ) : null}
                    <div className="runtime-custom-grid">
                      <div className="runtime-custom-column">
                        <h4>Custom Source Separation / 自定义源分离</h4>
                        {sourceRuntimeProvider ? <RuntimeCustomProviderSection provider={sourceRuntimeProvider} /> : null}
                      </div>
                      <div className="runtime-custom-column">
                        <h4>Custom Piano / 自定义钢琴转谱</h4>
                        {pianoRuntimeProvider ? <RuntimeCustomProviderSection provider={pianoRuntimeProvider} /> : null}
                      </div>
                      <div className="runtime-custom-column">
                        <h4>Custom Drums / 自定义鼓组转谱</h4>
                        {drumRuntimeProvider ? <RuntimeCustomProviderSection provider={drumRuntimeProvider} /> : null}
                      </div>
                    </div>
                  </section>
                  {runtimeDiagnosticsError ? <p className="error">{runtimeDiagnosticsError}</p> : null}
                </div>
              </details>
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
            <h2>
              What This Session Creates
              <br />
              本次将产出
            </h2>
            <div className="note-list compact-list">
              <article className="note-card ornate-card">
                <strong>Export First / 导出优先</strong>
                <div className="muted">Preview and editing stay lightweight here so you can validate the draft before exporting to professional notation tools. / 这里的预览与编辑保持轻量，重点是先验证草稿，再导出到专业记谱工具。</div>
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
            <h2>
              Project Entry
              <br />
              项目入口
            </h2>
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
            <h2>
              Workspace Notes
              <br />
              工作区提示
            </h2>
            <div className="note-list compact-list">
              <article className="note-card ornate-card">
                <strong>Stable Route / 稳定路由</strong>
                <div className="muted">{renderBilingualText(copy.project.localRouteNotice)}</div>
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
          <h2>
            Package Export
            <br />
            项目包导出
          </h2>
          <p style={{ whiteSpace: "pre-wrap" }}>{exportSuccessMessage}</p>
        </section>
      ) : null}
      {museScoreHandoffMessage ? (
        <section className="panel panel-full">
          <h2>
            MuseScore Handoff
            <br />
            MuseScore 交接
          </h2>
          <p style={{ whiteSpace: "pre-wrap" }}>{museScoreHandoffMessage}</p>
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
                {isExportingDraftMusicXml ? "Exporting... / 导出中..." : "Export Draft MusicXML / 导出草稿 MusicXML"}
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
                <div className="eyebrow">Verification Preview / 导出前校验</div>
                <h2>
                  Lightweight Preview
                  <br />
                  轻量预览
                </h2>
                <p className="muted section-help">
                  Use the browser preview to quickly verify transcription quality before export, not for final engraving.
                  <br />
                  浏览器内预览只用于导出前快速确认转谱质量，并不承担最终排版工作。
                </p>
              </div>
              <div className="result-meta-chip">{activeResult.bpm} BPM</div>
            </div>
            <article className="note-card ornate-card runtime-provider-summary-card">
              <strong>Provider Use Summary / Provider 使用摘要</strong>
              <div className="runtime-provider-summary-lines">
                {runtimeUsedProviderSummary.map((item) => {
                  const modeLabel = item.requestRecorded
                    ? item.requestedProvider === "auto"
                      ? "Auto"
                      : item.requestedLabel
                    : "Not recorded";
                  const behaviorText = !item.requestRecorded
                    ? "historical request not recorded"
                    : item.fallback
                      ? "fallback from requested provider"
                      : item.autoPickedEnhanced
                        ? "Auto picked optional enhanced"
                        : item.requestedProvider === "auto"
                          ? "Auto path"
                          : "requested provider";

                  return (
                    <div key={item.key}>
                      {item.label}: {item.usedLabel} (mode: {modeLabel}; {behaviorText})
                    </div>
                  );
                })}
              </div>
              <div className="muted runtime-provider-summary-help">
                {runtimeUsedFallbackDetected
                  ? "Fallback was detected in this result. / 本次结果检测到回退。"
                  : "No fallback warning was detected in this result. / 本次结果未检测到回退警告。"}
              </div>
            </article>
            <article className="score-secondary-card ornate-card audition-card">
              <h3>Quick Stem Check / 快速试听</h3>
              <p className="muted">
                Use these local stem previews to confirm separation worked. Full files are exposed here; in practice, the first 15-20 seconds are usually enough for a quick check.
                <br />
                使用这些本地分轨试听快速确认分离是否可用。这里直接播放完整分轨，实际通常试听前 15-20 秒就足够判断。
              </p>
              {auditionStemCards.length > 0 ? (
                <div className="audition-stem-list">
                  {auditionStemCards.map(({ label, stem, url }) => (
                    <div className="audition-stem-card" key={stem.stemName}>
                      <strong>{label}</strong>
                      <div className="muted">{stem.fileName}</div>
                      <audio controls preload="metadata" src={url}>
                        Your browser does not support audio preview.
                      </audio>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted">Stem audio preview becomes available after local stems are persisted. / 本地分轨持久化后即可试听。</p>
              )}
            </article>
            <div className="score-stack">
              <div className="score-primary-card ornate-card">
                <h3>Piano Verification / 钢琴校验预览</h3>
                <PianoScorePreview bpm={activeResult.bpm} track={pianoTrack} />
              </div>
              <div className="score-secondary-card ornate-card">
                <h3>Drum Verification / 鼓组校验预览</h3>
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
                  <h2>
                    Review and Refine
                    <br />
                    复核并微调
                  </h2>
                </div>
              </div>
              <p className="muted section-help">
                Keep edits lightweight here: fix obvious note issues, verify timing, and reduce cleanup work before export.
                <br />
                这里只做轻量修整：修正明显错音、确认时值节奏，并减少导出后的返工。
              </p>
              <div className="ornate-card preview-panel editor-workspace-panel">
                <h3>Lightweight Editor / 轻量编辑器</h3>
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
                  <h2>
                    Export and Handoff
                    <br />
                    导出与交接
                  </h2>
                  <p className="muted section-help">
                    MIDI and MusicXML are the core output. Use MuseScore for final notation polishing after this lightweight review step.
                    <br />
                    MIDI 与 MusicXML 是核心产出；完成这里的轻量复核后，建议转交 MuseScore 做最终排版润色。
                  </p>
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
                  <strong>MuseScore Handoff / 交接 MuseScore</strong>
                  <div className="muted">
                    Download the draft MusicXML, then open it in MuseScore for final notation editing and engraving. / 下载草稿 MusicXML，然后在 MuseScore 中完成最终记谱编辑与排版。
                  </div>
                  <div className="actions">
                    <button
                      className="button"
                      type="button"
                      disabled={!activeResult || isExportingDraftMusicXml}
                      onClick={() => void handleMusicXmlExport("draft")}
                    >
                      {isExportingDraftMusicXml ? "Preparing MuseScore handoff... / 准备交接中..." : "Open in MuseScore / 在 MuseScore 中打开"}
                    </button>
                  </div>
                  <div className="muted">
                    This downloads MusicXML only. No OS-level app launch is attempted. / 此操作仅下载 MusicXML，不会尝试系统级启动应用。
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
                          {provider.customProviders.length > 0 ? (
                            <div className="muted">
                              Custom registered: {provider.customProviders.length} / 已注册自定义 providers: {provider.customProviders.length}
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
                    <h3>{copy.project.projectSettings}</h3>
                    {projectDetail ? (
                      <div className="note-list compact-list">
                        <article className="note-card ornate-card">
                          <strong>Route / 路由</strong>
                          <div className="muted">{renderBilingualText(copy.project.localRouteNotice)}</div>
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
