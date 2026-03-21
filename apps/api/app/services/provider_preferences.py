from __future__ import annotations

from app.core.config import Settings, get_settings
from app.models.schemas import ProviderPreferences


def resolve_settings_with_provider_preferences(
    provider_preferences: ProviderPreferences | None,
    settings: Settings | None = None,
) -> Settings:
    resolved_settings = settings or get_settings()
    if provider_preferences is None:
        return resolved_settings

    updates = {}
    if provider_preferences.source_separation and provider_preferences.source_separation != "auto":
        updates["source_separation_provider"] = provider_preferences.source_separation
    if provider_preferences.piano_transcription and provider_preferences.piano_transcription != "auto":
        updates["piano_transcription_provider"] = provider_preferences.piano_transcription
    if provider_preferences.drum_transcription and provider_preferences.drum_transcription != "auto":
        updates["drum_transcription_provider"] = provider_preferences.drum_transcription

    return resolved_settings.model_copy(update=updates) if updates else resolved_settings
