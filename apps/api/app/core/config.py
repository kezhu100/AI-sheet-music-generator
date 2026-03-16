from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import List

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


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    settings.uploads_dir.mkdir(parents=True, exist_ok=True)
    settings.stems_dir.mkdir(parents=True, exist_ok=True)
    settings.drafts_dir.mkdir(parents=True, exist_ok=True)
    return settings
