from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import List, Optional

from pydantic import BaseModel


class Settings(BaseModel):
    app_name: str = "AI Sheet Music Generator API"
    api_prefix: str = "/api/v1"
    project_root: Path = Path(__file__).resolve().parents[2]
    data_dir: Path = Path(__file__).resolve().parents[2] / "data"
    uploads_dir: Path = Path(__file__).resolve().parents[2] / "data" / "uploads"
    stems_dir: Path = Path(__file__).resolve().parents[2] / "data" / "stems"
    drafts_dir: Path = Path(__file__).resolve().parents[2] / "data" / "drafts"
    cors_origins: List[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]
    source_separation_provider: str = "development-copy"
    source_separation_fallback_provider: Optional[str] = None
    source_separation_demucs_python: Optional[str] = None
    source_separation_demucs_model: str = "htdemucs"
    source_separation_demucs_device: Optional[str] = None
    source_separation_demucs_piano_source: str = "other"
    source_separation_demucs_drums_source: str = "drums"


@lru_cache
def get_settings() -> Settings:
    settings = Settings(
        source_separation_provider=os.getenv("SOURCE_SEPARATION_PROVIDER", "development-copy"),
        source_separation_fallback_provider=os.getenv("SOURCE_SEPARATION_FALLBACK_PROVIDER"),
        source_separation_demucs_python=os.getenv("SOURCE_SEPARATION_DEMUCS_PYTHON"),
        source_separation_demucs_model=os.getenv("SOURCE_SEPARATION_DEMUCS_MODEL", "htdemucs"),
        source_separation_demucs_device=os.getenv("SOURCE_SEPARATION_DEMUCS_DEVICE"),
        source_separation_demucs_piano_source=os.getenv("SOURCE_SEPARATION_DEMUCS_PIANO_SOURCE", "other"),
        source_separation_demucs_drums_source=os.getenv("SOURCE_SEPARATION_DEMUCS_DRUMS_SOURCE", "drums"),
    )
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    settings.uploads_dir.mkdir(parents=True, exist_ok=True)
    settings.stems_dir.mkdir(parents=True, exist_ok=True)
    settings.drafts_dir.mkdir(parents=True, exist_ok=True)
    return settings
