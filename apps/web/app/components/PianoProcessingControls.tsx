"use client";

import type {
  PianoPostProcessingBasePreset,
  ProcessingPreferences
} from "@ai-sheet-music-generator/shared-types";
import { getVisiblePianoPostProcessingPreset } from "../../lib/pianoProcessing";

type PianoFilterNumberKey = "lowCutHz" | "highCutHz" | "cleanupStrength";
type PianoPostProcessingNumberKey =
  | "isolatedWeakNoteThreshold"
  | "duplicateMergeToleranceMs"
  | "overlapTrimAggressiveness"
  | "confidenceThreshold";

interface PianoProcessingControlsProps {
  processingPreferences: ProcessingPreferences;
  disabled?: boolean;
  onTogglePianoFilterEnabled: (enabled: boolean) => void;
  onChangePianoFilterNumber: (key: PianoFilterNumberKey, value: number) => void;
  onTogglePianoPostProcessingEnabled: (enabled: boolean) => void;
  onSelectPianoPostProcessingPreset: (preset: PianoPostProcessingBasePreset) => void;
  onChangePianoPostProcessingNumber: (key: PianoPostProcessingNumberKey, value: number) => void;
  onToggleExtremeNoteFiltering: (enabled: boolean) => void;
}

const PRESET_COPY: Record<
  PianoPostProcessingBasePreset,
  { label: string; helper: string }
> = {
  low: {
    label: "Low cleanup / 轻度清理",
    helper: "Preserve more notes and do the least cleanup. / 尽量保留更多音符，只做较轻的清理。"
  },
  medium: {
    label: "Medium cleanup (Recommended) / 中等清理（推荐）",
    helper: "Balanced cleanup and note retention. / 在清理力度与音符保留之间取得平衡。"
  },
  high: {
    label: "High cleanup / 高强度清理",
    helper: "More aggressive filtering of likely residue and duplicates. / 更积极地去掉疑似残留、重复与弱音。"
  }
};

export function PianoProcessingControls({
  processingPreferences,
  disabled = false,
  onTogglePianoFilterEnabled,
  onChangePianoFilterNumber,
  onTogglePianoPostProcessingEnabled,
  onSelectPianoPostProcessingPreset,
  onChangePianoPostProcessingNumber,
  onToggleExtremeNoteFiltering
}: PianoProcessingControlsProps) {
  const visiblePreset = getVisiblePianoPostProcessingPreset(
    processingPreferences.pianoPostProcessing
  );
  const isCustomPostProcessing = processingPreferences.pianoPostProcessing.preset === "custom";

  return (
    <div className="piano-processing-controls">
      <section className="runtime-custom-section">
        <div className="runtime-custom-header">
          <div>
            <strong>Pre-Transcription Prep / 转写前预处理</strong>
            <div className="muted runtime-custom-help">
              This stage reshapes the piano stem before note extraction. Use it when separation leaves low-end or
              high-end residue in the piano audio.
              <br />
              这个阶段会在提取音符之前先处理钢琴 stem，适合在源分离后仍有低频或高频残留时使用。
            </div>
          </div>
        </div>
        <div className="runtime-custom-form ornate-card">
          <label className="runtime-option-card">
            <input
              checked={processingPreferences.pianoFilter.enabled}
              disabled={disabled}
              type="checkbox"
              onChange={(event) => onTogglePianoFilterEnabled(event.target.checked)}
            />
            <span className="runtime-option-label">
              Use filtered piano stem by default / 默认使用过滤后的钢琴 stem
            </span>
            <span className="muted">
              Keeps the raw separated stem available, but makes preview and transcription favor the cleaned stem. /
              保留原始分离 stem，同时让预览和转写优先使用清理后的版本。
            </span>
          </label>

          <div className="field">
            <label htmlFor="piano-filter-low-cut">
              Low cleanup / 低频清理: {Math.round(processingPreferences.pianoFilter.lowCutHz)} Hz
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
              Reduces low bass-like residue in the piano stem. / 减少钢琴 stem 里偏低频、像贝斯一样的残留。
            </div>
          </div>

          <div className="field">
            <label htmlFor="piano-filter-high-cut">
              High cleanup / 高频清理: {Math.round(processingPreferences.pianoFilter.highCutHz)} Hz
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
              Softens sharp high-frequency bleed that may confuse transcription. /
              柔化可能干扰转写的尖锐高频串音。
            </div>
          </div>

          <div className="field">
            <label htmlFor="piano-filter-strength">
              Cleanup strength / 清理强度: {processingPreferences.pianoFilter.cleanupStrength.toFixed(2)}
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
              Controls how strongly the piano stem is cleaned before transcription. /
              控制钢琴 stem 在转写前被清理得多强。
            </div>
          </div>
        </div>
      </section>

      <section className="runtime-custom-section">
        <div className="runtime-custom-header">
          <div>
            <strong>Post-Transcription Cleanup / 转写后清理</strong>
            <div className="muted runtime-custom-help">
              This stage cleans extracted piano notes after transcription. Keep it simple here, then use MuseScore for
              deeper notation polishing after export.
              <br />
              这个阶段会在转写完成后清理提取出的钢琴音符。这里保持简洁可控，真正深入的记谱整理仍建议交给 MuseScore。
            </div>
          </div>
        </div>
        <div className="runtime-custom-form ornate-card">
          <label className="runtime-option-card">
            <input
              checked={processingPreferences.pianoPostProcessing.enabled}
              disabled={disabled}
              type="checkbox"
              onChange={(event) => onTogglePianoPostProcessingEnabled(event.target.checked)}
            />
            <span className="runtime-option-label">Post-processing on / 开启后处理</span>
            <span className="muted">
              Turn piano note cleanup on or off after transcription. / 控制转写完成后的钢琴音符清理是否执行。
            </span>
          </label>

          <fieldset className="runtime-option-group">
            <legend>
              Cleanup strength
              <br />
              清理强度
            </legend>
            <div className="runtime-option-list">
              {(Object.keys(PRESET_COPY) as PianoPostProcessingBasePreset[]).map((preset) => (
                <label
                  className={`runtime-option-card ${
                    visiblePreset === preset && processingPreferences.pianoPostProcessing.enabled
                      ? "is-selected"
                      : ""
                  }`}
                  key={preset}
                >
                  <input
                    checked={visiblePreset === preset}
                    disabled={disabled || !processingPreferences.pianoPostProcessing.enabled}
                    name="piano-post-processing-preset"
                    type="radio"
                    value={preset}
                    onChange={() => onSelectPianoPostProcessingPreset(preset)}
                  />
                  <span className="runtime-option-label">{PRESET_COPY[preset].label}</span>
                  <span className="muted">{PRESET_COPY[preset].helper}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {isCustomPostProcessing ? (
            <div className="muted">
              Advanced values are currently customizing the {visiblePreset} preset. Selecting a preset again resets the
              advanced values to that profile.
              <br />
              当前高级参数已经把 {visiblePreset} 预设改成自定义状态；重新选择预设会把高级参数重置为对应档位。
            </div>
          ) : (
            <div className="muted">
              Medium cleanup is the recommended default. / 默认推荐使用中等清理。
            </div>
          )}

          <details>
            <summary>Advanced Settings / 高级设置</summary>
            <div className="runtime-custom-form">
              <div className="muted runtime-custom-help">
                Advanced edits switch this profile to custom. Selecting Low, Medium, or High again restores the preset
                bundle.
                <br />
                修改这些高级值后会进入自定义状态；重新点选低、中、高预设会恢复对应参数组合。
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
                  Higher values remove more isolated weak notes. / 值越高，越容易移除孤立的弱音符。
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
                  Higher values merge notes across a wider timing window. / 值越高，会在更宽的时间窗口内合并重复音符。
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
                  Higher values trim more same-pitch overlap after transcription. /
                  值越高，会更积极地修剪同音高音符之间的重叠。
                </div>
              </div>

              <label className="runtime-option-card">
                <input
                  checked={processingPreferences.pianoPostProcessing.extremeNoteFiltering}
                  disabled={disabled || !processingPreferences.pianoPostProcessing.enabled}
                  type="checkbox"
                  onChange={(event) => onToggleExtremeNoteFiltering(event.target.checked)}
                />
                <span className="runtime-option-label">
                  Extreme note filtering / 极端音域过滤
                </span>
                <span className="muted">
                  Removes more suspicious very low or very high notes. / 更积极地过滤过低或过高的可疑音符。
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
                  Higher values filter more low-confidence notes overall. / 值越高，整体会过滤更多低置信度音符。
                </div>
              </div>
            </div>
          </details>
        </div>
      </section>
    </div>
  );
}
