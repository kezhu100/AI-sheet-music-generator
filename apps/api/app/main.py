from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict

from app.api.jobs import router as jobs_router
from app.api.projects import router as projects_router
from app.api.uploads import router as uploads_router
from app.core.config import get_settings

settings = get_settings()

app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def healthcheck() -> Dict[str, str]:
    return {"status": "ok"}


app.include_router(uploads_router, prefix=settings.api_prefix)
app.include_router(jobs_router, prefix=settings.api_prefix)
app.include_router(projects_router, prefix=settings.api_prefix)
