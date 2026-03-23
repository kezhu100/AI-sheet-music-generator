"use client";

import type {
  PianoPreProcessingBasePreset,
  PianoPostProcessingBasePreset,
  ProcessingPreferences
} from "@ai-sheet-music-generator/shared-types";
import {
  getVisiblePianoFilterPreset,
  getVisiblePianoPostProcessingPreset
} from "../../lib/pianoProcessing";

type PianoFilterNumberKey = "lowCutHz" | "highCutHz" | "cleanupStrength";
type PianoPostProcessingNumberKey =
  | "isolatedWeakNoteThreshold"
  | "duplicateMergeToleranceMs"
  | "overlapTrimAggressiveness"
  | "confidenceThreshold";

interface ProcessingPipelineControlsProps {
  processingPreferences: ProcessingPreferences;
  disabled?: boolean;
  onTogglePianoFilterEnabled: (enabled: boolean) => void;
  onSelectPianoFilterPreset: (preset: PianoPreProcessingBasePreset) => void;
  onChangePianoFilterNumber: (key: PianoFilterNumberKey, value: number) => void;
  onTogglePianoPostProcessingEnabled: (enabled: boolean) => void;
  onSelectPianoPostProcessingPreset: (preset: PianoPostProcessingBasePreset) => void;
  onChangePianoPostProcessingNumber: (key: PianoPostProcessingNumberKey, value: number) => void;
  onToggleExtremeNoteFiltering: (enabled: boolean) => void;
}

const PRE_PROCESSING_PRESET_COPY: Record<
  PianoPreProcessingBasePreset,
  { label: string; helper: string }
> = {
  low: {
    label: "Low / 轻度",
    helper: "Keeps more of the original piano stem and removes only light bleed. / 保留更多原始钢琴 stem，只做轻度串音清理。"
  },
  medium: {
    label: "Medium (Recommended) / 中等（推荐）",
    helper: "Balanced cleanup for everyday mixes. / 适合大多数混音素材的平衡清理。"
  },
  high: {
    label: "High / 强力",
    helper: "More aggressively suppresses low-end and high-end residue before transcription. / 在转写前更积极地压低低频与高频残留。"
  }
};

const POST_PROCESSING_PRESET_COPY: Record<
  PianoPostProcessingBasePreset,
  { label: string; helper: string }
> = {
  low: {
    label: "Low / 轻度",
    helper: "Preserves more detected notes and applies the gentlest cleanup. / 尽量保留更多检测到的音符，只做最轻的清理。"
  },
  medium: {
    label: "Medium (Recommended) / 中等（推荐）",
    helper: "Balanced note cleanup with safer defaults. / 以更稳妥的默认值平衡清理力度与音符保留。"
  },
  high: {
    label: "High / 强力",
    helper: "More aggressively removes weak, duplicate, and suspicious notes. / 更积极地移除弱音、重复音与可疑音符。"
  }
};

function formatPresetLabel(preset: string): string {
  return preset.charAt(0).toUpperCase() + preset.slice(1);
}

interface PresetSelectorProps<TPreset extends string> {
  disabled?: boolean;
  enabled: boolean;
  fieldName: string;
  presets: Record<TPreset, { label: string; helper: string }>;
  visiblePreset: TPreset;
  onSelect: (preset: TPreset) => void;
}

function PresetSelector<TPreset extends string>({
  disabled = false,
  enabled,
  fieldName,
  presets,
  visiblePreset,
  onSelect
}: PresetSelectorProps<TPreset>) {
  return (
    <fieldset className="runtime-option-group">
      <legend>Cleanup Strength / 清理强度</legend>
      <div className="processing-preset-grid">
        {(Object.keys(presets) as TPreset[]).map((preset) => (
          <label
            className={`runtime-option-card preset-option-card ${
              visiblePreset === preset && enabled ? "is-selected" : ""
            }`}
            key={preset}
          >
            <input
              checked={visiblePreset === preset}
              disabled={disabled || !enabled}
              name={fieldName}
              type="radio"
              value={preset}
              onChange={() => onSelect(preset)}
            />
            <span className="runtime-option-label">{presets[preset].label}</span>
            <span className="muted">{presets[preset].helper}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

interface AdvancedSettingsHeaderProps {
  isCustom: boolean;
  visiblePreset: string;
}

function AdvancedSettingsHeader({ isCustom, visiblePreset }: AdvancedSettingsHeaderProps) {
  return (
    <summary className="advanced-settings-summary">
      <span>Advanced Settings / 高级设置</span>
      <span className={`advanced-settings-state ${isCustom ? "is-custom" : ""}`}>
        {isCustom ? `Custom (based on ${formatPresetLabel(visiblePreset)})` : `${formatPresetLabel(visiblePreset)} preset`}
      </span>
    </summary>
  );
}

export function ProcessingPipelineControls({
  processingPreferences,
  disabled = false,
  onTogglePianoFilterEnabled,
  onSelectPianoFilterPreset,
  onChangePianoFilterNumber,
  onTogglePianoPostProcessingEnabled,
  onSelectPianoPostProcessingPreset,
  onChangePianoPostProcessingNumber,
  onToggleExtremeNoteFiltering
}: ProcessingPipelineControlsProps) {
  const visiblePreProcessingPreset = getVisiblePianoFilterPreset(processingPreferences.pianoFilter);
  const visiblePostProcessingPreset = getVisiblePianoPostProcessingPreset(
    processingPreferences.pianoPostProcessing
  );
  const isCustomPreProcessing = processingPreferences.pianoFilter.preset === "custom";
  const isCustomPostProcessing = processingPreferences.pianoPostProcessing.preset === "custom";

  return (
    <div className="piano-processing-controls">
      <section className="processing-stage-card ornate-card">
        <div className="processing-stage-header">
          <div>
            <strong>Pre-Processing / 转写前预处理</strong>
            <div className="muted runtime-custom-help">
              Clean the piano audio before transcription. This stage shapes the separated stem so the transcription
              model hears a cleaner signal.
              <br />
              在转写之前先清理钢琴音频。这个阶段会先整理分离出的 stem，让转写模型听到更干净的信号。
            </div>
          </div>
        </div>

        <div className="processing-stage-body">
          <label className="runtime-option-card stage-toggle-card">
            <input
              checked={processingPreferences.pianoFilter.enabled}
              disabled={disabled}
              type="checkbox"
              onChange={(event) => onTogglePianoFilterEnabled(event.target.checked)}
            />
            <span className="runtime-option-label">Pre-processing on / 开启预处理</span>
            <span className="muted">
              Uses a cleaned piano stem for preview and transcription, while keeping the raw stem available for quick
              comparison.
              <br />
              为预览与转写使用清理后的钢琴 stem，同时保留原始 stem 供快速对比。
            </span>
          </label>

          <PresetSelector
            disabled={disabled}
            enabled={processingPreferences.pianoFilter.enabled}
            fieldName="piano-pre-processing-preset"
            presets={PRE_PROCESSING_PRESET_COPY}
            visiblePreset={visiblePreProcessingPreset}
            onSelect={onSelectPianoFilterPreset}
          />

          <div className="processing-preset-note muted">
            {isCustomPreProcessing
              ? `Advanced values are currently customizing the ${formatPresetLabel(visiblePreProcessingPreset)} preset. Selecting Low, Medium, or High resets those values for this stage.`
              : "Medium is the recommended default when you just want a cleaner piano stem before transcription."}
          </div>

          <details className="advanced-settings-panel">
            <AdvancedSettingsHeader
              isCustom={isCustomPreProcessing}
              visiblePreset={visiblePreProcessingPreset}
            />
            <div className="advanced-settings-body">
              <div className="muted runtime-custom-help">
                Advanced edits switch this stage to custom. Choose Low, Medium, or High again any time to restore that
                preset bundle.
                <br />
                调整这些高级参数后会切换到自定义状态；随时重新选择 Low、Medium 或 High 即可恢复对应预设。
              </div>

              <div className="field">
                <label htmlFor="piano-filter-low-cut">
                  Low cutoff / 低频截止: {Math.round(processingPreferences.pianoFilter.lowCutHz)} Hz
                </label>
                <input
                  id="piano-filter-low-cut"
                  type="range"
                  min="20"
                  max="180"
                  step="5"
                  disabled={disabled || !processingPreferences.pianoFilter.enabled}
                  value={processingPreferences.pianoFilter.lowCutHz}
                  onChange={(event) =>
                    onChangePianoFilterNumber("lowCutHz", Number(event.target.value))
                  }
                />
                <div className="muted">
                  Removes bass-heavy residue that often leaks into the piano stem. / 去掉更容易混入钢琴 stem 的低频残留。
                </div>
              </div>

              <div className="field">
                <label htmlFor="piano-filter-high-cut">
                  High cutoff / 高频截止: {Math.round(processingPreferences.pianoFilter.highCutHz)} Hz
                </label>
                <input
                  id="piano-filter-high-cut"
                  type="range"
                  min="3000"
                  max="12000"
                  step="250"
                  disabled={disabled || !processingPreferences.pianoFilter.enabled}
                  value={processingPreferences.pianoFilter.highCutHz}
                  onChange={(event) =>
                    onChangePianoFilterNumber("highCutHz", Number(event.target.value))
                  }
                />
                <div className="muted">
                  Softens sharp cymbal-like or vocal-like bleed before note extraction. / 在提取音符前柔化更尖锐的镲片感或人声感串音。
                </div>
              </div>

              <div className="field">
                <label htmlFor="piano-filter-strength">
                  Bleed suppression / 串音抑制: {processingPreferences.pianoFilter.cleanupStrength.toFixed(2)}
                </label>
                <input
                  id="piano-filter-strength"
                  type="range"
                  min="0"
                  max="0.9"
                  step="0.05"
                  disabled={disabled || !processingPreferences.pianoFilter.enabled}
                  value={processingPreferences.pianoFilter.cleanupStrength}
                  onChange={(event) =>
                    onChangePianoFilterNumber("cleanupStrength", Number(event.target.value))
                  }
                />
                <div className="muted">
                  Blends more of the cleaned stem into the transcription input. / 调高后会让转写输入更多依赖清理后的 stem。
                </div>
              </div>
            </div>
          </details>
        </div>
      </section>

      <section className="processing-stage-card ornate-card">
        <div className="processing-stage-header">
          <div>
            <strong>Post-Processing / 转写后清理</strong>
            <div className="muted runtime-custom-help">
              Clean extracted notes after transcription. This stage removes obvious weak, duplicate, or suspicious
              notes before you verify and export.
              <br />
              在转写完成后再清理提取出的音符。这个阶段会在你校验和导出前移除明显的弱音、重复音和可疑音符。
            </div>
          </div>
        </div>

        <div className="processing-stage-body">
          <label className="runtime-option-card stage-toggle-card">
            <input
              checked={processingPreferences.pianoPostProcessing.enabled}
              disabled={disabled}
              type="checkbox"
              onChange={(event) => onTogglePianoPostProcessingEnabled(event.target.checked)}
            />
            <span className="runtime-option-label">Post-processing on / 开启后处理</span>
            <span className="muted">
              Keeps browser cleanup simple here, then leaves deeper notation polishing to MuseScore after export.
              <br />
              这里保持轻量清理，把更深入的记谱整理留给导出后的 MuseScore。
            </span>
          </label>

          <PresetSelector
            disabled={disabled}
            enabled={processingPreferences.pianoPostProcessing.enabled}
            fieldName="piano-post-processing-preset"
            presets={POST_PROCESSING_PRESET_COPY}
            visiblePreset={visiblePostProcessingPreset}
            onSelect={onSelectPianoPostProcessingPreset}
          />

          <div className="processing-preset-note muted">
            {isCustomPostProcessing
              ? `Advanced values are currently customizing the ${formatPresetLabel(visiblePostProcessingPreset)} preset. Selecting Low, Medium, or High resets those values for this stage.`
              : "Medium is the recommended default when you want safer note cleanup before export."}
          </div>

          <details className="advanced-settings-panel">
            <AdvancedSettingsHeader
              isCustom={isCustomPostProcessing}
              visiblePreset={visiblePostProcessingPreset}
            />
            <div className="advanced-settings-body">
              <div className="muted runtime-custom-help">
                Advanced edits switch this stage to custom. Choose Low, Medium, or High again any time to restore that
                preset bundle.
                <br />
                调整这些高级参数后会切换到自定义状态；随时重新选择 Low、Medium 或 High 即可恢复对应预设。
              </div>

              <div className="field">
                <label htmlFor="piano-post-isolated-threshold">
                  Isolated weak note threshold / 孤立弱音阈值:{" "}
                  {processingPreferences.pianoPostProcessing.isolatedWeakNoteThreshold.toFixed(2)}
                </label>
                <input
                  id="piano-post-isolated-threshold"
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  disabled={disabled || !processingPreferences.pianoPostProcessing.enabled}
                  value={processingPreferences.pianoPostProcessing.isolatedWeakNoteThreshold}
                  onChange={(event) =>
                    onChangePianoPostProcessingNumber(
                      "isolatedWeakNoteThreshold",
                      Number(event.target.value)
                    )
                  }
                />
                <div className="muted">
                  Higher values remove more isolated weak notes. / 数值越高，越容易删掉孤立的弱音符。
                </div>
              </div>

              <div className="field">
                <label htmlFor="piano-post-duplicate-tolerance">
                  Duplicate merge tolerance / 重复合并容差:{" "}
                  {processingPreferences.pianoPostProcessing.duplicateMergeToleranceMs} ms
                </label>
                <input
                  id="piano-post-duplicate-tolerance"
                  type="range"
                  min="10"
                  max="200"
                  step="5"
                  disabled={disabled || !processingPreferences.pianoPostProcessing.enabled}
                  value={processingPreferences.pianoPostProcessing.duplicateMergeToleranceMs}
                  onChange={(event) =>
                    onChangePianoPostProcessingNumber(
                      "duplicateMergeToleranceMs",
                      Number(event.target.value)
                    )
                  }
                />
                <div className="muted">
                  Higher values merge notes across a wider timing window. / 数值越高，越会在更宽的时间范围内合并重复音符。
                </div>
              </div>

              <div className="field">
                <label htmlFor="piano-post-overlap-trim">
                  Overlap trim aggressiveness / 重叠修剪强度:{" "}
                  {processingPreferences.pianoPostProcessing.overlapTrimAggressiveness.toFixed(2)}
                </label>
                <input
                  id="piano-post-overlap-trim"
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  disabled={disabled || !processingPreferences.pianoPostProcessing.enabled}
                  value={processingPreferences.pianoPostProcessing.overlapTrimAggressiveness}
                  onChange={(event) =>
                    onChangePianoPostProcessingNumber(
                      "overlapTrimAggressiveness",
                      Number(event.target.value)
                    )
                  }
                />
                <div className="muted">
                  Higher values trim more same-pitch overlap after transcription. / 数值越高，越会积极修剪同音高的重叠音符。
                </div>
              </div>

              <label className="runtime-option-card">
                <input
                  checked={processingPreferences.pianoPostProcessing.extremeNoteFiltering}
                  disabled={disabled || !processingPreferences.pianoPostProcessing.enabled}
                  type="checkbox"
                  onChange={(event) => onToggleExtremeNoteFiltering(event.target.checked)}
                />
                <span className="runtime-option-label">Extreme note filtering / 极端音域过滤</span>
                <span className="muted">
                  Removes more suspicious very low or very high notes. / 更积极地过滤特别低或特别高的可疑音符。
                </span>
              </label>

              <div className="field">
                <label htmlFor="piano-post-confidence-threshold">
                  Confidence threshold / 置信度阈值:{" "}
                  {processingPreferences.pianoPostProcessing.confidenceThreshold.toFixed(2)}
                </label>
                <input
                  id="piano-post-confidence-threshold"
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  disabled={disabled || !processingPreferences.pianoPostProcessing.enabled}
                  value={processingPreferences.pianoPostProcessing.confidenceThreshold}
                  onChange={(event) =>
                    onChangePianoPostProcessingNumber(
                      "confidenceThreshold",
                      Number(event.target.value)
                    )
                  }
                />
                <div className="muted">
                  Higher values filter more low-confidence notes overall. / 数值越高，整体会过滤更多低置信度音符。
                </div>
              </div>
            </div>
          </details>
        </div>
      </section>
    </div>
  );
}
