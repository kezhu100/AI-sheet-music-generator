import type {
  PianoFilterSettings,
  PianoPreProcessingBasePreset,
  PianoPostProcessingBasePreset,
  PianoPostProcessingSettings,
  ProcessingPreferences
} from "@ai-sheet-music-generator/shared-types";

type PianoFilterPresetValues = Omit<PianoFilterSettings, "enabled" | "preset" | "basePreset">;
type PianoPostProcessingPresetValues = Omit<
  PianoPostProcessingSettings,
  "enabled" | "preset" | "basePreset"
>;

const PIANO_FILTER_PRESET_VALUES: Record<PianoPreProcessingBasePreset, PianoFilterPresetValues> = {
  low: {
    lowCutHz: 35,
    highCutHz: 9000,
    cleanupStrength: 0.24
  },
  medium: {
    lowCutHz: 45,
    highCutHz: 7200,
    cleanupStrength: 0.42
  },
  high: {
    lowCutHz: 60,
    highCutHz: 6000,
    cleanupStrength: 0.64
  }
};

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
    preset: "medium",
    basePreset: "medium",
    ...PIANO_FILTER_PRESET_VALUES.medium
  },
  pianoPostProcessing: {
    enabled: true,
    preset: "medium",
    basePreset: "medium",
    ...PIANO_POST_PROCESSING_PRESET_VALUES.medium
  }
};

export function buildPianoFilterFromPreset(
  preset: PianoPreProcessingBasePreset,
  enabled = true
): ProcessingPreferences["pianoFilter"] {
  return {
    enabled,
    preset,
    basePreset: preset,
    ...PIANO_FILTER_PRESET_VALUES[preset]
  };
}

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

export function getVisiblePianoFilterPreset(
  settings: ProcessingPreferences["pianoFilter"]
): PianoPreProcessingBasePreset {
  return settings.preset === "custom" ? settings.basePreset : settings.preset;
}

export function getVisiblePianoPostProcessingPreset(
  settings: ProcessingPreferences["pianoPostProcessing"]
): PianoPostProcessingBasePreset {
  return settings.preset === "custom" ? settings.basePreset : settings.preset;
}

export function toEditableProcessingPreferences(
  processingPreferences?: ProcessingPreferences | null
): ProcessingPreferences {
  const defaultFilter = DEFAULT_PROCESSING_PREFERENCES.pianoFilter;
  const incomingFilter = processingPreferences?.pianoFilter;
  const visibleFilterPreset = incomingFilter
    ? getVisiblePianoFilterPreset({
        ...defaultFilter,
        ...incomingFilter
      })
    : defaultFilter.basePreset;
  const presetInitializedFilter =
    incomingFilter?.preset === "custom" ||
    (incomingFilter?.preset == null &&
      (incomingFilter?.lowCutHz !== undefined ||
        incomingFilter?.highCutHz !== undefined ||
        incomingFilter?.cleanupStrength !== undefined))
      ? {
          ...defaultFilter,
          ...incomingFilter,
          preset: "custom",
          basePreset: incomingFilter?.basePreset ?? visibleFilterPreset
        }
      : buildPianoFilterFromPreset(
          visibleFilterPreset,
          incomingFilter?.enabled ?? defaultFilter.enabled
        );
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
    pianoFilter: presetInitializedFilter as ProcessingPreferences["pianoFilter"],
    pianoPostProcessing: presetInitializedPostProcessing
  };
}
