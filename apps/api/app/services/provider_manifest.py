from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Iterable, Optional

from app.models.schemas import ProviderCategory, ProviderLayer

PROVIDER_CATEGORY_SOURCE_SEPARATION: ProviderCategory = "source-separation"
PROVIDER_CATEGORY_PIANO_TRANSCRIPTION: ProviderCategory = "piano-transcription"
PROVIDER_CATEGORY_DRUM_TRANSCRIPTION: ProviderCategory = "drum-transcription"


@dataclass(frozen=True)
class ProviderCapabilityManifest:
    id: str
    category: ProviderCategory
    display_name: str
    provider_layer: ProviderLayer
    recommended: bool
    module_name: Optional[str]
    pip_packages: tuple[str, ...]
    help_text: str
    actionable_steps: tuple[str, ...]

    @property
    def built_in(self) -> bool:
        return self.provider_layer == "built_in_base"

    @property
    def official_enhanced(self) -> bool:
        return self.provider_layer == "official_enhanced"


OFFICIAL_ENHANCED_PROVIDER_IDS: tuple[str, ...] = ("demucs", "basic-pitch", "demucs-drums")


PROVIDER_MANIFESTS: tuple[ProviderCapabilityManifest, ...] = (
    ProviderCapabilityManifest(
        id="development-copy",
        category=PROVIDER_CATEGORY_SOURCE_SEPARATION,
        display_name="Development copy",
        provider_layer="built_in_base",
        recommended=False,
        module_name=None,
        pip_packages=(),
        help_text="Built-in local baseline source separation provider.",
        actionable_steps=(),
    ),
    ProviderCapabilityManifest(
        id="demucs",
        category=PROVIDER_CATEGORY_SOURCE_SEPARATION,
        display_name="Demucs",
        provider_layer="official_enhanced",
        recommended=True,
        module_name="demucs",
        pip_packages=("demucs",),
        help_text="Optional enhanced source separation provider for stronger local stem quality.",
        actionable_steps=(
            "Use the explicit install action to add Demucs to the configured local Python runtime.",
            "If unavailable, keep Auto/default on development-copy to preserve local fallback behavior.",
        ),
    ),
    ProviderCapabilityManifest(
        id="heuristic",
        category=PROVIDER_CATEGORY_PIANO_TRANSCRIPTION,
        display_name="Heuristic WAV",
        provider_layer="built_in_base",
        recommended=False,
        module_name=None,
        pip_packages=(),
        help_text="Built-in local baseline piano transcription provider.",
        actionable_steps=(),
    ),
    ProviderCapabilityManifest(
        id="basic-pitch",
        category=PROVIDER_CATEGORY_PIANO_TRANSCRIPTION,
        display_name="Basic Pitch",
        provider_layer="official_enhanced",
        recommended=True,
        module_name="basic_pitch",
        pip_packages=("basic-pitch",),
        help_text="Optional enhanced piano transcription provider using Basic Pitch.",
        actionable_steps=(
            "Use the explicit install action to add Basic Pitch to the configured local Python runtime.",
            "If unavailable, keep Auto/default on heuristic to preserve local fallback behavior.",
        ),
    ),
    ProviderCapabilityManifest(
        id="heuristic",
        category=PROVIDER_CATEGORY_DRUM_TRANSCRIPTION,
        display_name="Heuristic WAV",
        provider_layer="built_in_base",
        recommended=False,
        module_name=None,
        pip_packages=(),
        help_text="Built-in local baseline drum transcription provider.",
        actionable_steps=(),
    ),
    ProviderCapabilityManifest(
        id="demucs-drums",
        category=PROVIDER_CATEGORY_DRUM_TRANSCRIPTION,
        display_name="Demucs Drums",
        provider_layer="official_enhanced",
        recommended=True,
        module_name="demucs",
        pip_packages=("demucs",),
        help_text="Optional enhanced drum transcription provider using Demucs drum stem isolation plus lightweight rule-based onset detection. The built-in heuristic drum provider remains the stable fallback.",
        actionable_steps=(
            "Use the explicit install action to add Demucs to the configured local Python runtime for the enhanced drum path.",
            "If the enhanced drum path is unavailable, keep Auto/default on heuristic to preserve stable local drum fallback behavior.",
        ),
    ),
)


def iter_manifests_for_category(category: ProviderCategory) -> Iterable[ProviderCapabilityManifest]:
    return (manifest for manifest in PROVIDER_MANIFESTS if manifest.category == category)


def get_official_enhanced_manifest(provider_id: str) -> Optional[ProviderCapabilityManifest]:
    for manifest in PROVIDER_MANIFESTS:
        if manifest.id == provider_id and manifest.official_enhanced:
            return manifest
    return None


def build_manifest_index() -> Dict[tuple[ProviderCategory, str], ProviderCapabilityManifest]:
    return {(manifest.category, manifest.id): manifest for manifest in PROVIDER_MANIFESTS}
