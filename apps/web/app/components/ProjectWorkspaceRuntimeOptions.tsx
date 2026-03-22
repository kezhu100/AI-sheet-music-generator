"use client";

import { type MouseEvent } from "react";
import type {
  ProcessingPreferences,
  ProviderInstallState,
  ProviderPreferences,
  RuntimeProviderOption,
  RuntimeProviderStatus
} from "@ai-sheet-music-generator/shared-types";

export interface RuntimeProviderInstallUiState {
  state: ProviderInstallState | "starting";
  installId?: string;
  message: string;
  failureReason?: string;
  actionableSteps: string[];
  preferenceKey: keyof ProviderPreferences;
  useAfterInstall: boolean;
  targetProvider: NonNullable<ProviderPreferences[keyof ProviderPreferences]>;
}

export interface RuntimeCustomProviderInstallUiState {
  state: ProviderInstallState | "starting";
  installId?: string;
  message: string;
  failureReason?: string;
  actionableSteps: string[];
  targetManifestUrl: string;
}

function buildRuntimeOptionInstallKey(option: RuntimeProviderOption): string {
  return `${option.category}:${option.id}`;
}

function getFirstActionableStep(steps: string[]): string | null {
  if (steps.length === 0) {
    return null;
  }

  return steps[0]?.trim() || null;
}

function getProviderLayerLabel(option: RuntimeProviderOption): string {
  return option.optionalEnhanced ? "Official enhanced / 官方增强" : "Built-in / 内置";
}

function getProviderInstallFailureNote(option: RuntimeProviderOption, failed: boolean): string | null {
  if (!failed || option.id !== "demucs-drums") {
    return null;
  }

  return "Demucs Drums needs the local Demucs runtime. Built-in drum transcription remains available. / Demucs Drums 需要本地 Demucs 运行时，内置鼓组转写仍可作为稳定回退。";
}

interface RuntimeCustomProviderSectionProps {
  provider: RuntimeProviderStatus;
}

function RuntimeCustomProviderSection({ provider }: RuntimeCustomProviderSectionProps) {
  if (provider.customProviders.length === 0) {
    return (
      <div className="runtime-custom-provider-list">
        <article className="runtime-custom-card">
          <strong>Custom Registered Providers / 已注册自定义提供方</strong>
          <div className="muted">
            No custom registrations yet. Not part of Auto or execution in this step.
            <br />
            目前还没有已注册项目；本阶段仅提供注册与诊断展示。
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
          <div className="runtime-provider-kind runtime-provider-kind-custom">Custom Registered / 已注册自定义</div>
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
                  Installing official provider... / 正在安装官方提供方...
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

interface PianoFilterSettingsPanelProps {
  value: ProcessingPreferences["pianoFilter"];
  disabled?: boolean;
  onToggleEnabled: (enabled: boolean) => void;
  onChangeNumber: (key: "lowCutHz" | "highCutHz" | "cleanupStrength", value: number) => void;
}

function PianoFilterSettingsPanel({
  value,
  disabled = false,
  onToggleEnabled,
  onChangeNumber
}: PianoFilterSettingsPanelProps) {
  return (
    <section className="runtime-custom-section">
      <div className="runtime-custom-header">
        <div>
          <strong>Piano Stem Cleanup / 钢琴 Stem 清理</strong>
          <div className="muted runtime-custom-help">
            This lightweight pre-filter runs after source separation and before piano transcription. The filtered piano stem
            is also the default piano preview.
            <br />
            这个轻量预过滤步骤位于源分离之后、钢琴转写之前。过滤后的钢琴 stem 也会作为默认钢琴预览。
          </div>
        </div>
      </div>
      <div className="runtime-custom-form ornate-card">
        <label className="runtime-option-card">
          <input
            checked={value.enabled}
            disabled={disabled}
            type="checkbox"
            onChange={(event) => onToggleEnabled(event.target.checked)}
          />
          <span className="runtime-option-label">Use filtered piano stem by default / 默认使用过滤后的钢琴 stem</span>
          <span className="muted">Keeps the raw separated stem available, but makes preview and transcription favor the cleaned stem. / 保留原始分离 stem，同时让预览和转写优先使用清理后的版本。</span>
        </label>

        <div className="field">
          <label htmlFor="piano-filter-low-cut">Low cleanup / 低频清理: {Math.round(value.lowCutHz)} Hz</label>
          <input
            id="piano-filter-low-cut"
            type="range"
            min="20"
            max="180"
            step="5"
            disabled={disabled || !value.enabled}
            value={value.lowCutHz}
            onChange={(event) => onChangeNumber("lowCutHz", Number(event.target.value))}
          />
          <div className="muted">Reduces low bass-like residue in the piano stem. / 减少钢琴 stem 里偏低频、像贝斯一样的残留。</div>
        </div>

        <div className="field">
          <label htmlFor="piano-filter-high-cut">High cleanup / 高频清理: {Math.round(value.highCutHz)} Hz</label>
          <input
            id="piano-filter-high-cut"
            type="range"
            min="3000"
            max="12000"
            step="250"
            disabled={disabled || !value.enabled}
            value={value.highCutHz}
            onChange={(event) => onChangeNumber("highCutHz", Number(event.target.value))}
          />
          <div className="muted">Softens sharp high-frequency bleed that may confuse transcription. / 柔化可能干扰转写的尖锐高频串音。</div>
        </div>

        <div className="field">
          <label htmlFor="piano-filter-strength">Cleanup strength / 清理强度: {value.cleanupStrength.toFixed(2)}</label>
          <input
            id="piano-filter-strength"
            type="range"
            min="0"
            max="0.9"
            step="0.05"
            disabled={disabled || !value.enabled}
            value={value.cleanupStrength}
            onChange={(event) => onChangeNumber("cleanupStrength", Number(event.target.value))}
          />
          <div className="muted">Controls how strongly the piano stem is cleaned before transcription. / 控制钢琴 stem 在转写前被清理得多强。</div>
        </div>
      </div>
    </section>
  );
}

interface ProjectWorkspaceRuntimeOptionsProps {
  isRefreshingRuntimeDiagnostics: boolean;
  onRefreshRuntimeDiagnostics: () => void;
  providerPreferences: ProviderPreferences;
  onSourcePreferenceChange: (value: "auto" | "development-copy" | "demucs") => void;
  onPianoPreferenceChange: (value: "auto" | "heuristic" | "basic-pitch") => void;
  onDrumPreferenceChange: (value: "auto" | "heuristic" | "demucs-drums") => void;
  providerInstallStates: Record<string, RuntimeProviderInstallUiState>;
  onInstallProviderOption: (
    preferenceKey: keyof ProviderPreferences,
    option: RuntimeProviderOption,
    options: { useAfterInstall: boolean; forceReinstall: boolean }
  ) => void;
  sourceRuntimeProvider?: RuntimeProviderStatus;
  pianoRuntimeProvider?: RuntimeProviderStatus;
  drumRuntimeProvider?: RuntimeProviderStatus;
  processingPreferences: ProcessingPreferences;
  onTogglePianoFilterEnabled: (enabled: boolean) => void;
  onChangePianoFilterNumber: (key: "lowCutHz" | "highCutHz" | "cleanupStrength", value: number) => void;
  isCustomProviderFormOpen: boolean;
  onToggleCustomProviderForm: () => void;
  customProviderManifestUrl: string;
  onChangeCustomProviderManifestUrl: (value: string) => void;
  onConfirmCustomProviderInstall: () => void;
  onCancelCustomProviderForm: () => void;
  customProviderInstallState: RuntimeCustomProviderInstallUiState | null;
  runtimeDiagnosticsError: string | null;
}

export function ProjectWorkspaceRuntimeOptions({
  isRefreshingRuntimeDiagnostics,
  onRefreshRuntimeDiagnostics,
  providerPreferences,
  onSourcePreferenceChange,
  onPianoPreferenceChange,
  onDrumPreferenceChange,
  providerInstallStates,
  onInstallProviderOption,
  sourceRuntimeProvider,
  pianoRuntimeProvider,
  drumRuntimeProvider,
  processingPreferences,
  onTogglePianoFilterEnabled,
  onChangePianoFilterNumber,
  isCustomProviderFormOpen,
  onToggleCustomProviderForm,
  customProviderManifestUrl,
  onChangeCustomProviderManifestUrl,
  onConfirmCustomProviderInstall,
  onCancelCustomProviderForm,
  customProviderInstallState,
  runtimeDiagnosticsError
}: ProjectWorkspaceRuntimeOptionsProps) {
  return (
    <details className="runtime-options-panel ornate-card">
      <summary>Runtime Options / 运行选项</summary>
      <div className="runtime-options-body">
        <p className="muted">
          Built-in providers stay ready by default. Official enhanced providers are optional, and custom providers only
          register for diagnostics in this step.
          <br />
          内置提供方默认可直接使用。官方增强提供方可按需安装；自定义提供方在本阶段仅用于注册与诊断展示。
        </p>
        <div className="runtime-options-toolbar">
          <button
            className="button tertiary button-tiny"
            type="button"
            disabled={isRefreshingRuntimeDiagnostics}
            onClick={onRefreshRuntimeDiagnostics}
          >
            {isRefreshingRuntimeDiagnostics ? "Refreshing... / 正在刷新..." : "Refresh Availability / 刷新可用性"}
          </button>
        </div>
        <div className="runtime-option-grid">
          <RuntimeProviderPreferenceField
            currentValue={providerPreferences.sourceSeparation}
            fieldName="source-separation-provider"
            preferenceKey="sourceSeparation"
            onChange={(value) => onSourcePreferenceChange(value as "auto" | "development-copy" | "demucs")}
            onInstall={onInstallProviderOption}
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
            onChange={(value) => onPianoPreferenceChange(value as "auto" | "heuristic" | "basic-pitch")}
            onInstall={onInstallProviderOption}
            installStates={providerInstallStates}
            options={pianoRuntimeProvider?.options}
            selectedProviderLabel={pianoRuntimeProvider?.selectedProviderLabel}
            title="Piano Transcription"
            titleZh="钢琴转写"
          />
          <RuntimeProviderPreferenceField
            currentValue={providerPreferences.drumTranscription}
            fieldName="drum-transcription-provider"
            preferenceKey="drumTranscription"
            onChange={(value) => onDrumPreferenceChange(value as "auto" | "heuristic" | "demucs-drums")}
            onInstall={onInstallProviderOption}
            installStates={providerInstallStates}
            options={drumRuntimeProvider?.options}
            selectedProviderLabel={drumRuntimeProvider?.selectedProviderLabel}
            title="Drum Transcription"
            titleZh="鼓组转写"
          />
        </div>
        <PianoFilterSettingsPanel
          value={processingPreferences.pianoFilter}
          onToggleEnabled={onTogglePianoFilterEnabled}
          onChangeNumber={onChangePianoFilterNumber}
        />
        <section className="runtime-custom-section">
          <div className="runtime-custom-header">
            <div>
              <strong>Register Custom Provider / 注册自定义提供方</strong>
              <div className="muted runtime-custom-help">
                Local manifest URL only. Registers a diagnostic entry, not an execution-ready provider.
                <br />
                仅支持本地 manifest URL，且只接受本地 file://...json 路径。本阶段仅用于注册与诊断展示。
              </div>
            </div>
            <button className="button tertiary button-tiny" type="button" onClick={onToggleCustomProviderForm}>
              {isCustomProviderFormOpen ? "Close / 收起" : "Register Custom Provider / 注册自定义提供方"}
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
                  onChange={(event) => onChangeCustomProviderManifestUrl(event.target.value)}
                />
              </div>
              <div className="actions">
                <button className="button secondary button-tiny" type="button" onClick={onConfirmCustomProviderInstall}>
                  Confirm / 确认
                </button>
                <button className="button tertiary button-tiny" type="button" onClick={onCancelCustomProviderForm}>
                  Cancel / 取消
                </button>
              </div>
            </div>
          ) : null}
          {customProviderInstallState ? (
            <article
              className={`runtime-custom-status ${
                customProviderInstallState.state === "completed"
                  ? "is-success"
                  : customProviderInstallState.state === "failed"
                    ? "is-error"
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
              <div className="muted">Not used by Auto or the main pipeline in this step. / 本阶段不会进入 Auto 或主流程执行。</div>
              {customProviderInstallState.targetManifestUrl ? (
                <div className="muted">Manifest URL: {customProviderInstallState.targetManifestUrl}</div>
              ) : null}
              {getFirstActionableStep(customProviderInstallState.actionableSteps) ? (
                <div className="muted">Next step: {getFirstActionableStep(customProviderInstallState.actionableSteps)}</div>
              ) : null}
            </article>
          ) : null}
          <div className="runtime-custom-grid">
            <div className="runtime-custom-column">
              <h4>Custom Source Separation / 自定义源分离</h4>
              {sourceRuntimeProvider ? <RuntimeCustomProviderSection provider={sourceRuntimeProvider} /> : null}
            </div>
            <div className="runtime-custom-column">
              <h4>Custom Piano / 自定义钢琴转写</h4>
              {pianoRuntimeProvider ? <RuntimeCustomProviderSection provider={pianoRuntimeProvider} /> : null}
            </div>
            <div className="runtime-custom-column">
              <h4>Custom Drums / 自定义鼓组转写</h4>
              {drumRuntimeProvider ? <RuntimeCustomProviderSection provider={drumRuntimeProvider} /> : null}
            </div>
          </div>
        </section>
        {runtimeDiagnosticsError ? <p className="error">{runtimeDiagnosticsError}</p> : null}
      </div>
    </details>
  );
}
