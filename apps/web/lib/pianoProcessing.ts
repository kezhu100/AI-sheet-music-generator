import type {
  PianoPostProcessingBasePreset,
  PianoPostProcessingSettings,
  ProcessingPreferences
} from "@ai-sheet-music-generator/shared-types";

type PianoPostProcessingPresetValues = Omit<
  PianoPostProcessingSettings,
  "enabled" | "preset" | "basePreset"
>;

const PIANO_POST_PROCESSING_PRESET_VALUES: Record<
  PianoPostProcessingBasePreset,
  PianoPostProcessingPresetValues
> = {
  low: {
    isolatedWeakNoteThreshold: 0.48,
    duplicateMergeToleranceMs: 55,
    overlapTrimAggressiveness: 0.35,
    extremeNoteFiltering: false,
    confidenceThreshold: 0.24
  },
  medium: {
    isolatedWeakNoteThreshold: 0.58,
    duplicateMergeToleranceMs: 80,
    overlapTrimAggressiveness: 0.75,
    extremeNoteFiltering: true,
    confidenceThreshold: 0.35
  },
  high: {
    isolatedWeakNoteThreshold: 0.68,
    duplicateMergeToleranceMs: 110,
    overlapTrimAggressiveness: 1,
    extremeNoteFiltering: true,
    confidenceThreshold: 0.45
  }
};

export const DEFAULT_PROCESSING_PREFERENCES: ProcessingPreferences = {
  pianoFilter: {
    enabled: true,
    lowCutHz: 45,
    highCutHz: 7200,
    cleanupStrength: 0.42
  },
  pianoPostProcessing: {
    enabled: true,
    preset: "medium",
    basePreset: "medium",
    ...PIANO_POST_PROCESSING_PRESET_VALUES.medium
  }
};

export function buildPianoPostProcessingFromPreset(
  preset: PianoPostProcessingBasePreset,
  enabled = true
): ProcessingPreferences["pianoPostProcessing"] {
  return {
    enabled,
    preset,
    basePreset: preset,
    ...PIANO_POST_PROCESSING_PRESET_VALUES[preset]
  };
}

export function getVisiblePianoPostProcessingPreset(
  settings: ProcessingPreferences["pianoPostProcessing"]
): PianoPostProcessingBasePreset {
  return settings.preset === "custom" ? settings.basePreset : settings.preset;
}

export function toEditableProcessingPreferences(
  processingPreferences?: ProcessingPreferences | null
): ProcessingPreferences {
  const defaultPostProcessing = DEFAULT_PROCESSING_PREFERENCES.pianoPostProcessing;
  const incomingPostProcessing = processingPreferences?.pianoPostProcessing;
  const visiblePreset = incomingPostProcessing
    ? getVisiblePianoPostProcessingPreset({
        ...defaultPostProcessing,
        ...incomingPostProcessing
      })
    : defaultPostProcessing.basePreset;
  const presetInitializedPostProcessing =
    incomingPostProcessing?.preset === "custom"
      ? {
          ...defaultPostProcessing,
          ...incomingPostProcessing,
          basePreset: incomingPostProcessing.basePreset ?? visiblePreset
        }
      : buildPianoPostProcessingFromPreset(
          visiblePreset,
          incomingPostProcessing?.enabled ?? defaultPostProcessing.enabled
        );

  return {
    pianoFilter: {
      enabled:
        processingPreferences?.pianoFilter?.enabled ??
        DEFAULT_PROCESSING_PREFERENCES.pianoFilter.enabled,
      lowCutHz:
        processingPreferences?.pianoFilter?.lowCutHz ??
        DEFAULT_PROCESSING_PREFERENCES.pianoFilter.lowCutHz,
      highCutHz:
        processingPreferences?.pianoFilter?.highCutHz ??
        DEFAULT_PROCESSING_PREFERENCES.pianoFilter.highCutHz,
      cleanupStrength:
        processingPreferences?.pianoFilter?.cleanupStrength ??
        DEFAULT_PROCESSING_PREFERENCES.pianoFilter.cleanupStrength
    },
    pianoPostProcessing: presetInitializedPostProcessing
  };
}
