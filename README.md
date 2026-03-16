# AI Sheet Music Generator

AI Sheet Music Generator is a modular monorepo for turning uploaded audio into editable draft sheet music, starting with piano and drums.

## Project Overview

The repository is organized to support an incremental build-out of the full pipeline:

- `apps/web`: Next.js frontend for upload, job status, and result preview
- `apps/api`: FastAPI backend for uploads, job orchestration, and processing
- `packages/shared-types`: shared TypeScript DTOs and event schemas
- `packages/music-engine`: reusable music-domain helpers for frontend-facing music logic

The long-term goal is to support source separation, piano transcription, drum transcription, normalized note events, and export flows without hard-coding the system to a single provider.

## Current Status

Current milestone:

- Phase 0 completed: monorepo scaffold, frontend app, backend app, shared package structure
- Phase 1 completed: audio upload, job creation, job status polling, and UI integration
- Phase 2 completed: source separation interface, first backend, persisted stems, and stem result display

Current behavior:

- The repository demonstrates the full `upload -> job -> result` pipeline
- Source separation now runs through a dedicated backend provider and persists per-job stem files locally
- The current separation backend is a local development placeholder that copies the uploaded audio into `piano_stem` and `drum_stem` files so the stem lifecycle is real even though the audio is not yet truly separated
- Piano and drum transcription remain mocked on top of those persisted stems
- Export, score rendering, and editing phases have not started yet

## Environment Requirements

### Backend environment

- Current scaffold tested on Python 3.9.13
- Recommended environment for future ML integrations: Python 3.11+
- Backend stack: FastAPI

### Frontend environment

- Node.js 18+ recommended
- `npm` workspaces are used for the monorepo
- Frontend stack: Next.js + TypeScript

## Basic Local Setup

### Frontend

1. Install Node.js 18 or newer.
2. Run `npm install` from the repository root.
3. Run `npm run dev:web`.

The frontend expects the API at `http://127.0.0.1:8000` by default. Override with `NEXT_PUBLIC_API_BASE_URL`.

### Backend

1. Install Python 3.9 for the current scaffold, or Python 3.11+ if you are preparing for future ML integrations.
2. Create a virtual environment in `apps/api`.
3. Install dependencies with `py -m pip install -r apps/api/requirements.txt`.
4. Start the API with `py -m uvicorn app.main:app --reload --app-dir apps/api`.

Uploaded files are stored locally in `apps/api/data/uploads`.
Generated stems are stored locally in `apps/api/data/stems/<job-id>`.

## Running Phase 2 Locally

1. Start the API with `py -m uvicorn app.main:app --reload --app-dir apps/api`.
2. Start the frontend with `npm run dev:web`.
3. Upload an audio file from the UI.
4. Wait for the job to complete and inspect the returned stems, tracks, and warnings.

Supported local-development stem formats:

- `.wav`
- `.mp3`
- `.flac`
- `.ogg`
- `.m4a`
- any other uploaded extension is copied through unchanged without extra validation

Current Phase 2 limitations:

- The separation backend is provider-based and persists real files, but it is still a placeholder backend for local development rather than a validated ML separator
- Generated `piano_stem` and `drum_stem` files currently contain copies of the original upload
- Piano and drum note events are still mocked
- There are no stem download endpoints yet; the UI currently exposes metadata and storage paths only
- Job state is still in-memory and is lost when the API restarts

## What Is Not Implemented Yet

- validated ML source separation quality
- piano transcription backends
- drum transcription backends
- export endpoints
- score editing
