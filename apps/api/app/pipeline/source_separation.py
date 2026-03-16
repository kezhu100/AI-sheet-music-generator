from __future__ import annotations

from pathlib import Path

from app.pipeline.interfaces import SourceSeparationProvider, SourceStem
from app.services.storage import persist_stem_copy, resolve_project_path


class LocalDevelopmentSourceSeparationProvider(SourceSeparationProvider):
    provider_name = "local-development-separation"

    def separate(self, audio_path: Path, job_id: str) -> list[SourceStem]:
        stem_specs = [
            ("piano_stem", "piano"),
            ("drum_stem", "drums"),
        ]

        stems: list[SourceStem] = []
        for stem_name, instrument_hint in stem_specs:
            stem_asset = persist_stem_copy(
                source_path=audio_path,
                job_id=job_id,
                stem_name=stem_name,
                instrument_hint=instrument_hint,
                provider=self.provider_name,
            )
            stems.append(
                SourceStem(
                    stem_name=stem_name,
                    instrument_hint=instrument_hint,
                    file_path=resolve_project_path(stem_asset.stored_path),
                    stem_asset=stem_asset,
                )
            )

        return stems
