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
- Phase 3 completed: first real piano transcription provider, normalized piano note events, and piano note preview UI
- Phase 4 completed: first real drum transcription provider, normalized drum hit events, pipeline cleanup rename, and drum preview UI
- Phase 5 completed: lightweight post-processing stage with tempo estimation, quantization, beat/bar alignment, track merge logic, and confidence-based filtering
- Phase 5.5 completed: internal timing-layer consolidation with extracted reusable helper modules for backend and frontend-facing code

Current behavior:

- The repository demonstrates the full `upload -> job -> result` pipeline
- Source separation still runs through a local development backend that copies the uploaded file into per-job stem files
- Piano transcription is now real for uncompressed PCM `.wav` stems through a heuristic stdlib-only provider
- Drum transcription is now real for uncompressed PCM `.wav` stems through a heuristic stdlib-only provider
- Post-processing now estimates tempo, quantizes note timing, aligns beat/bar positions, and filters low-confidence events before result delivery
- Timing conversions and timing display helpers are now organized into reusable utility modules to prepare for later export work
- Export, score rendering, and editing phases have not started yet

## Environment Requirements

### Backend environment

- Current scaffold tested on Python 3.9.13
- Recommended environment for future ML integrations: Python 3.11+
- Backend stack: FastAPI
- No new heavy DSP or ML dependencies were introduced for Phase 5

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

## Running Phase 5 Locally

1. Start the API with `py -m uvicorn app.main:app --reload --app-dir apps/api`.
2. Start the frontend with `npm run dev:web`.
3. Upload an audio file from the UI.
4. Wait for the job to complete and inspect the returned stems, estimated tempo, piano notes, drum hits, track summaries, and warnings.

Current real transcription support:

- uncompressed PCM `.wav` stems
- 8-bit, 16-bit, or 32-bit PCM WAV sample widths
- simple monophonic or lightly overlapping piano phrases work best for piano
- simple onset-heavy percussive material works best for drums

Current limitations:

- the separation backend is still a placeholder development backend, so uploaded audio is copied into `piano_stem` and `drum_stem` rather than truly separated
- real piano transcription currently runs only on uncompressed PCM `.wav` stems
- real drum transcription currently runs only on uncompressed PCM `.wav` stems
- the heuristic piano provider is intentionally lightweight and may simplify or miss dense polyphonic passages
- the heuristic drum provider is intentionally lightweight and may simplify or misclassify dense drum-kit material
- post-processing currently assumes a simple 4/4 grid and a single project-wide tempo estimate
- there are no stem download endpoints yet; the UI currently exposes metadata and storage paths only
- job state is still in-memory and is lost when the API restarts

## Validation Performed

- backend pipeline test with a generated PCM WAV sample clip
- backend startup/import sanity check
- frontend TypeScript typecheck

## What Is Not Implemented Yet

- validated ML source separation quality
- MIDI export
- MusicXML export
- score rendering and editing
