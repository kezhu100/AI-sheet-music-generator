from __future__ import annotations

import gc
import os
import stat
import time
from pathlib import Path
from threading import Lock
from typing import Optional

from app.core.config import get_settings
from app.models.schemas import JobDraftRecord, JobResult, utc_now


class DraftStore:
    def __init__(self, drafts_dir: Path) -> None:
        self._drafts_dir = drafts_dir
        self._lock = Lock()
        self._drafts_dir.mkdir(parents=True, exist_ok=True)

    def get(self, job_id: str) -> Optional[JobDraftRecord]:
        draft_path = self._build_path(job_id)
        if not draft_path.exists():
            return None

        with self._lock:
            return JobDraftRecord.model_validate_json(draft_path.read_text(encoding="utf-8"))

    def save(self, job_id: str, result: JobResult) -> JobDraftRecord:
        with self._lock:
            existing = self._read_without_lock(job_id)
            draft = JobDraftRecord(
                jobId=job_id,
                version=(existing.version + 1) if existing is not None else 1,
                savedAt=utc_now(),
                result=result,
            )
            self._build_path(job_id).write_text(draft.model_dump_json(by_alias=True, indent=2), encoding="utf-8")
            return draft

    def save_record(self, draft: JobDraftRecord) -> JobDraftRecord:
        with self._lock:
            self._build_path(draft.job_id).write_text(draft.model_dump_json(by_alias=True, indent=2), encoding="utf-8")
            return draft

    def delete(self, job_id: str) -> None:
        with self._lock:
            draft_path = self._build_path(job_id)
            if draft_path.exists():
                for attempt in range(3):
                    try:
                        os.chmod(draft_path, stat.S_IWRITE)
                        draft_path.unlink()
                        break
                    except PermissionError:
                        gc.collect()
                        time.sleep(0.02 * (attempt + 1))

    def _read_without_lock(self, job_id: str) -> Optional[JobDraftRecord]:
        draft_path = self._build_path(job_id)
        if not draft_path.exists():
            return None
        return JobDraftRecord.model_validate_json(draft_path.read_text(encoding="utf-8"))

    def _build_path(self, job_id: str) -> Path:
        return self._drafts_dir / f"{job_id}.json"


draft_store = DraftStore(get_settings().drafts_dir)
