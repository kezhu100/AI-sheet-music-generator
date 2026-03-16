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
- Phase 6 completed: minimal MIDI and MusicXML export, download endpoints, and frontend export actions are now implemented
- Phase 7 completed: piano-roll preview, simplified piano score preview, simplified drum notation preview, and track visibility toggles are now implemented
- Phase 8 completed: frontend draft editing with note selection, drag timing moves, piano pitch adjustment, add/delete note controls, and edited re-export is now implemented
- Phase 8 engineering wrap-up completed: backend test setup is clearer, focused editing-helper tests now run, and draft-state orchestration is slightly more maintainable

Current behavior:

- The repository demonstrates the full `upload -> job -> result` pipeline
- Source separation still runs through a local development backend that copies the uploaded file into per-job stem files
- Piano transcription is now real for uncompressed PCM `.wav` stems through a heuristic stdlib-only provider
- Drum transcription is now real for uncompressed PCM `.wav` stems through a heuristic stdlib-only provider
- Post-processing now estimates tempo, quantizes note timing, aligns beat/bar positions, and filters low-confidence events before result delivery
- Timing conversions and timing display helpers are now organized into reusable utility modules to prepare for later export work
- Completed jobs can now be exported as minimal MIDI and MusicXML drafts generated from the post-processed result
- Completed jobs can now be visually inspected in a piano-roll plus simplified piano/drum score preview UI driven by the normalized result
- Editing tools are now available as a frontend-first draft workflow on completed jobs
- Phase 8 hardening now adds stable draft note identity, centralized editing helpers, normalization before export, and stricter backend override validation

## Environment Requirements

### Backend environment

- Current scaffold tested on Python 3.9.13
- Recommended environment for future ML integrations: Python 3.11+
- Backend stack: FastAPI
- No new heavy DSP, ML, MIDI-writing, or MusicXML dependencies were introduced for the current Phase 6 export path

### Frontend environment

- Node.js 18+ recommended
- `npm` workspaces are used for the monorepo
- Frontend stack: Next.js + TypeScript

## Basic Local Setup

### Frontend

1. Install Node.js 18 or newer.
2. Run `npm install` from the repository root.

The frontend expects the API at `http://127.0.0.1:8000` by default. Override with `NEXT_PUBLIC_API_BASE_URL`.

### Backend

1. Install Python 3.9 for the current scaffold, or Python 3.11+ if you are preparing for future ML integrations.
2. Create a virtual environment in `apps/api`.
3. Install runtime dependencies with `py -m pip install -r apps/api/requirements.txt`.
4. Install backend test dependencies with `py -m pip install -r apps/api/requirements-dev.txt` if you want to run the API test suite locally.
5. Keep the virtual environment located at `apps/api/venv` so the root dev script can find its Python interpreter automatically.

Uploaded files are stored locally in `apps/api/data/uploads`.
Generated stems are stored locally in `apps/api/data/stems/<job-id>`.

## Local Development

### One-command startup from the repo root

Run:

`npm run dev`

This starts both local services together from the repository root:

- web app: `http://127.0.0.1:3000`
- API: `http://127.0.0.1:8000`
- API health check: `http://127.0.0.1:8000/health`

The root script does two things:

- starts the Next.js web app workspace in dev mode
- starts the FastAPI app with the Python interpreter from `apps/api/venv`
- links both child processes so the local dev session shuts down together

### Prerequisites

Before `npm run dev` will work, make sure:

1. `npm install` has been run from the repository root.
2. A Python virtual environment exists at `apps/api/venv`.
3. The API dependencies from `apps/api/requirements.txt` are installed into that venv.
4. If you want backend tests locally, install `apps/api/requirements-dev.txt` into that same venv.

Example Windows PowerShell setup:

```powershell
py -m venv apps/api/venv
apps/api/venv/Scripts/python.exe -m pip install -r apps/api/requirements.txt
apps/api/venv/Scripts/python.exe -m pip install -r apps/api/requirements-dev.txt
```

Unix-like example:

```bash
python3 -m venv apps/api/venv
apps/api/venv/bin/python -m pip install -r apps/api/requirements.txt
apps/api/venv/bin/python -m pip install -r apps/api/requirements-dev.txt
```

If the API venv is missing, the root dev script exits with a clear message instead of silently falling back to another Python installation.

### Platform notes

- The root dev command is designed to be practical on Windows and works from the repository root in PowerShell.
- It is also intended to behave correctly in Windows Git Bash / MINGW64, where the script uses shell-based spawning for compatibility.
- It should also work on Unix-like systems if the API virtual environment lives at `apps/api/venv/bin/python`.
- No manual venv activation is required for the one-command workflow because the root script calls the venv interpreter directly.
- Press `Ctrl+C` in the root terminal to stop the combined local development session. The script will attempt to stop both the web and API processes together.

### Optional single-service commands

- `npm run dev:web`: start only the Next.js app
- `npm run dev:api`: start only the FastAPI app through the same root helper script

## Running Phase 8 Locally

1. Run `npm run dev` from the repository root.
2. Open `http://127.0.0.1:3000`.
3. Upload an audio file from the UI.
4. Wait for the job to complete and inspect the returned stems, estimated tempo, piano-roll preview, simplified piano/drum score previews, track visibility toggles, editing draft controls, warnings, and MIDI/MusicXML export actions.
5. Select a note from the piano roll or event list, drag it horizontally to move timing, adjust piano pitch or duration in the editor, add/delete notes, and re-export the draft.

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
- MIDI export currently assumes the same single tempo and quantized timing already produced by Phase 5
- MusicXML export currently assumes the same single tempo and 4/4 grid, and focuses on structural compatibility rather than engraving quality
- the piano score preview is intentionally simplified, currently shows only the first visible piano track, and focuses on inspection rather than engraving fidelity
- the drum preview is notation-oriented but lane/grid based rather than full percussion staff engraving, and currently shows only the first visible drum track
- Phase 8 edits are draft-only in the frontend and are not persisted back into backend job storage
- edited draft notes now receive stable `draftNoteId` values used for selection and note operations
- drum note lane reassignment is not implemented in this MVP; drum editing currently supports timing move, add, and delete only
- backend edited export override payloads are now validated and rejected when note timing, pitch, duration, or track structure is invalid
- preview panes currently limit notation-style rendering to the first 8 bars for readability
- there are no stem download endpoints yet; the UI currently exposes metadata and storage paths only
- job state is still in-memory and is lost when the API restarts

## Validation Performed

Recommended local validation commands:

- `npm run typecheck`
- `npm run test:music-engine`
- `npm run test:api`
- `npm run validate`

Current validation reality:

- `npm run validate` now runs workspace typecheck, focused `packages/music-engine` editing tests, and backend unittest discovery through the project venv
- backend tests require `apps/api/requirements-dev.txt` because `fastapi.testclient` depends on `httpx`
- frontend lint is still not part of the reliable validation workflow because the repo does not yet include a completed ESLint setup and `next lint` still opens the interactive Next.js configuration prompt

## What Is Not Implemented Yet

- validated ML source separation quality
- persisted edit history or saved projects
- drum lane reassignment
