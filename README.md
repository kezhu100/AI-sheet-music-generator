# AI Sheet Music Generator

AI Sheet Music Generator is a local-first AI tool that turns audio into editable draft sheet music for piano and drums.

The current product direction is local-first: the app runs as local backend services plus a browser UI on your machine, with local filesystem persistence and no cloud, account, or SaaS assumptions.

## What Works Today

- upload audio and create a processing job
- run provider-based source separation, piano transcription, drum transcription, and backend post-processing
- inspect normalized stems, tracks, warnings, piano-roll preview, simplified piano score preview, and simplified drum notation preview
- edit the generated draft in the browser with selection, drag timing, quantization, undo/redo, drum lane reassignment, and add/delete note controls
- save the latest edited draft separately from the original completed backend result
- export either the original result or the current draft as MIDI or MusicXML
- re-transcribe a selected piano or drum region from persisted stems
- analyze the current editable draft and apply heuristic correction suggestions
- reopen persisted projects from a local filesystem-backed project library
- rename, duplicate, and delete local projects from the library and project workspace
- open a local project folder path by importing it into the local library
- export a local project as a portable zip package to a local filesystem path
- import a portable zip package as a new independent local project instance
- start the local app through a user-facing `npm run app` / `start-local` flow with runtime diagnostics

## Current Local MVP Limits

- results are editable drafts, not guaranteed final notation
- project library, saved drafts, and share routes are local/deployment-scoped and do not provide accounts, ownership, or public publishing
- job execution is still in-memory and is not recoverable after API restart
- source separation and transcription quality remain bounded by the configured providers and their documented fallbacks
- engraving, tempo-map support, and advanced notation fidelity are still intentionally limited

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
- Phase 9 completed: edited draft persistence, save/load draft APIs, auto-loaded saved drafts, explicit save action, minimal draft version tracking, and original-vs-draft export actions are now implemented
- Phase 10 completed: undo/redo, additive and box note selection, keyboard editing shortcuts, quantization tools, drum lane reassignment, and richer editing tests are now implemented
- Phase 11A completed: source separation now supports explicit provider selection, an optional stronger Demucs backend, and a documented fallback path while preserving normalized persisted stems and downstream contracts
- Phase 11B completed: piano transcription now supports explicit provider selection, an optional stronger Basic Pitch backend, and a documented fallback path while preserving the normalized result pipeline
- Phase 11C completed: drum transcription now supports explicit provider selection, an optional stronger madmom-backed backend, and a documented fallback path while preserving the normalized result pipeline
- Phase 11D completed: backend post-processing is now more robust, with stronger tempo estimation, confidence-aware cleanup, adaptive quantization, duplicate removal, overlap cleanup, and steadier merged track output while preserving the normalized `JobResult` contract
- Phase 11E completed: region re-transcription now reuses persisted stems, the configured transcription providers, and backend post-processing to replace a selected draft time range without recomputing the whole job
- Phase 11F completed: AI-assisted correction now analyzes the current editable draft, returns heuristic suggestion objects for likely note issues, highlights suggested notes in the editor, and lets users apply each suggestion as one undoable draft edit without changing the normalized `JobResult`
- Phase 12 MVP completed: a local project library, manifest-backed project asset summaries, immutable completed original-result persistence, stable local project routes, and lightweight onboarding improvements are now implemented without adding accounts or public sharing
- Phase 12.5 completed: project rename/delete/duplicate, duplicated draft-id isolation, clearer library metadata/status messaging, unsaved draft indicators, locale-ready project copy structure, and sidebar/workspace/settings cleanup are now implemented on top of the Phase 12 MVP
- Phase 13L completed: local project open/import/export flows, zip-based project packaging, imported project identity regeneration, and local package validation are now implemented on top of the existing manifest-backed project library
- Phase 14L completed: user-facing local app startup, app-mode runtime preflight, backend runtime diagnostics, optional browser auto-open, and frontend runtime guidance are now implemented while keeping the app browser-based and local-first

Current behavior:

- The repository demonstrates the full `upload -> job -> result` pipeline
- Source separation now runs through a configured provider: the default development copy backend remains available, and an optional Demucs-based backend can be selected with graceful fallback
- Piano transcription now runs through a configured provider: the default heuristic backend remains available, and an optional Basic Pitch-based backend can be selected with graceful fallback
- Drum transcription now runs through a configured provider: the default heuristic backend remains available, and an optional madmom-based backend can be selected with graceful fallback
- Post-processing now cleans provider output before delivery: it merges compatible tracks, filters low-confidence or suspiciously short noisy events, estimates a single project tempo from weighted onset evidence, picks an eighth-note or sixteenth-note grid adaptively, removes near-duplicate events, trims overlapping piano durations when needed, and aligns final beat/bar positions
- Timing conversions and timing display helpers are now organized into reusable utility modules to prepare for later export work
- Completed jobs can now be exported as minimal MIDI and MusicXML drafts generated from the post-processed result
- Completed jobs can now be visually inspected in a piano-roll plus simplified piano/drum score preview UI driven by the normalized result
- Editing tools are now available as a frontend-first draft workflow on completed jobs
- Phase 8 hardening now adds stable draft note identity, centralized editing helpers, normalization before export, and stricter backend override validation
- Phase 9 now persists the latest saved edited `JobResult` per completed job in local backend draft storage without mutating the original completed result
- Phase 10 now adds session-local undo/redo, multi-note selection, piano-roll box selection, keyboard nudging shortcuts, explicit quantization actions, and drum lane reassignment on the same normalized draft result shape
- Phase 11E now adds draft-only region re-transcription for piano or drums, letting the editor request replacement notes for a selected time range without mutating the original completed backend result
- the region re-transcription endpoint now reports which backend actually produced the returned region notes through `providerUsed`, including fallback cases
- Phase 11F now adds a draft-only correction-analysis endpoint plus editor suggestion markers and apply actions; analysis stays heuristic, suggestion-based, and does not mutate the stored completed result or the `JobResult` contract
- project rename now updates manifest-backed project labels without mutating the immutable persisted `original-result.json`
- project duplication now creates a new local project/job identity, copies the persisted original result plus latest saved draft when present, and namespaces duplicated draft note ids so source and duplicate do not share draft identifier space
- persisted completed projects can now continue using draft save/load, export, analysis, and region re-transcription flows through filesystem-backed project fallback even when no in-memory job record is available
- Phase 13L keeps the managed local library as the live source of truth under `apps/api/data/projects/<project-id>/`
- open-local now imports a valid local project folder into the current library as a local project instance unless the selected path already points at an existing managed project
- in Phase 13L, `open-local` is intentionally import-into-library, not open-in-place; this favors local identity isolation and project-library consistency over path-coupled editing
- export now writes a portable zip package directly from the local backend to a caller-supplied local filesystem path
- portable project import now restores a new local project, restores the immutable original result plus saved draft separately, restores source upload and persisted stems when present in the package, and always assigns a fresh local `projectId`
- imported bundles never reuse the source bundle `projectId` as the active local project identity, and imported draft note ids are re-namespaced to the new local project instance
- import validates the package format version and rejects unknown versions
- unknown or incompatible package versions fail with clear import errors
- package format evolution should stay backward-compatible where practical, and new package fields should preferably be additive
- zip import enforces package size limits and path-safety checks instead of blindly trusting archive contents
- export now fails clearly when the target output file already exists; it does not silently overwrite existing files

## Environment Requirements

### Backend environment

- Current scaffold and validation workflow still run on Python 3.9.13
- Recommended environment for stronger ML integrations: Python 3.11+
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
Saved edited drafts are stored locally in `apps/api/data/drafts/<job-id>.json`.
Phase 12 project manifests are stored locally in `apps/api/data/projects/<project-id>/manifest.json`.
Phase 12 immutable completed originals are stored locally in `apps/api/data/projects/<project-id>/original-result.json`.
Phase 13L portable project export packages are zip files written to the local path you choose and contain:

- `project-package.json`
- `manifest.json`
- `original-result.json`
- `saved-draft.json` when a saved draft exists
- `assets/source-upload/...` when the source upload file is available locally
- `assets/stems/...` for persisted stem files that are available locally

Phase 12 MVP routes and endpoints:

- web library route: `/projects`
- web project route: `/projects/{projectId}`
- API list route: `GET /api/v1/projects`
- API detail route: `GET /api/v1/projects/{projectId}`
- API open-local route: `POST /api/v1/projects/open-local`
- API export route: `POST /api/v1/projects/{projectId}/export`
- API import route: `POST /api/v1/projects/import`

Optional source separation configuration:

- `SOURCE_SEPARATION_PROVIDER=development-copy` keeps the local placeholder stem-copy backend
- `SOURCE_SEPARATION_PROVIDER=demucs` enables the stronger Demucs-backed provider
- `SOURCE_SEPARATION_FALLBACK_PROVIDER=development-copy` enables automatic fallback when the selected primary provider is unavailable
- `SOURCE_SEPARATION_DEMUCS_PYTHON=/path/to/python` can point to a separate Python environment where Demucs is installed
- `SOURCE_SEPARATION_DEMUCS_MODEL=htdemucs` selects the Demucs model name
- `SOURCE_SEPARATION_DEMUCS_DEVICE=cpu` or another supported device string passes through to Demucs
- `SOURCE_SEPARATION_DEMUCS_PIANO_SOURCE=other` controls which Demucs output is normalized into `piano_stem`
- `SOURCE_SEPARATION_DEMUCS_DRUMS_SOURCE=drums` controls which Demucs output is normalized into `drum_stem`

Optional piano transcription configuration:

- `PIANO_TRANSCRIPTION_PROVIDER=heuristic` keeps the stdlib heuristic piano backend
- `PIANO_TRANSCRIPTION_PROVIDER=ml` enables the stronger Basic Pitch-backed piano provider
- `PIANO_TRANSCRIPTION_PROVIDER=basic-pitch` also enables the same Basic Pitch-backed piano provider explicitly
- `PIANO_TRANSCRIPTION_FALLBACK_PROVIDER=heuristic` enables automatic fallback when the selected primary provider is unavailable
- `PIANO_TRANSCRIPTION_ML_PYTHON=/path/to/python` can point to a separate Python environment where `basic-pitch` is installed
- `PIANO_TRANSCRIPTION_ML_MIN_CONFIDENCE=0.35` controls the minimum confidence threshold before raw ML notes are normalized into `NoteEvent` output

Optional drum transcription configuration:

- `DRUM_TRANSCRIPTION_PROVIDER=heuristic` keeps the stdlib heuristic drum backend
- `DRUM_TRANSCRIPTION_PROVIDER=ml` enables the stronger madmom-backed drum provider
- `DRUM_TRANSCRIPTION_PROVIDER=madmom` also enables the same madmom-backed drum provider explicitly
- `DRUM_TRANSCRIPTION_FALLBACK_PROVIDER=heuristic` enables automatic fallback when the selected primary provider is unavailable
- `DRUM_TRANSCRIPTION_ML_PYTHON=/path/to/python` can point to a separate Python environment where `madmom` is installed
- `DRUM_TRANSCRIPTION_ML_MIN_CONFIDENCE=0.35` controls the minimum confidence threshold before normalized drum hits are emitted from the stronger provider path

## Local Development

### One-command startup from the repo root

Developer workflow:

`npm run dev`

This keeps the existing developer-oriented behavior:

- starts both local services together from the repository root
- does not auto-open the browser
- keeps startup checks minimal beyond the existing `apps/api/venv` requirement

User-facing local app workflow:

`npm run app`

This adds the Phase 14L local-app behavior:

- runs app-mode runtime preflight before starting the API
- starts the API in a no-reload single-process mode intended for stable local app startup
- starts the browser UI plus API together
- waits for readiness before optionally opening the actual selected local web URL
- surfaces provider/runtime issues honestly without treating optional ML integrations as mandatory when fallback remains valid

You can also use:

- `start-local.ps1` on Windows PowerShell
- `./start-local.sh` on Unix-like shells

Run this to check the local app environment without starting the services:

`npm run app:check`

Disable browser auto-open in app mode with either:

- `npm run app -- --no-open`
- `APP_START_NO_OPEN=1 npm run app`

Recommended usage:

- use `npm run app` for normal local app usage
- use `npm run dev` when actively developing and you want the existing developer workflow

### Existing dev startup behavior

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

This remains the developer workflow. Phase 14L adds a separate app-mode startup instead of changing dev-mode behavior.

### Prerequisites

Before either `npm run dev` or `npm run app` will work, make sure:

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
- `npm run app` adds strict app-mode-only preflight checks for blocking runtime issues; `npm run dev` stays the lighter developer path.

### Optional single-service commands

- `npm run dev:web`: start only the Next.js app
- `npm run dev:api`: start only the FastAPI app through the same root helper script

### App-mode runtime diagnostics

Phase 14L adds:

- `GET /api/v1/runtime` for honest local runtime and provider diagnostics
- a compact runtime panel on the upload page
- app-mode preflight that blocks only when startup is truly impossible

App-mode preflight blocks only for:

- missing or unusable `apps/api/venv` Python runtime
- explicitly configured provider selections with no usable fallback

App-mode preflight does not block for:

- optional stronger ML runtimes that are not selected
- selected stronger ML runtimes when a valid fallback provider is configured

Common app-mode startup fixes:

- missing `node` or `npm`: install Node.js 18+ and rerun `npm run app`
- missing root dependencies: run `npm install` from the repository root
- missing `apps/api/venv`: create the API virtual environment and install `apps/api/requirements.txt`
- missing configured Python/ML runtime with no fallback: either install that runtime or switch back to the documented fallback provider
- port `3000` or `8000` already in use: stop the conflicting process and rerun `npm run app`

## Running the Current Phase 12.5 Build Locally

1. Run `npm run app` from the repository root for the user-facing local app flow, or `npm run dev` if you want the existing developer workflow.
2. Open `http://127.0.0.1:3000`.
3. Upload an audio file from the UI.
4. Wait for the job to complete and inspect the returned stems, estimated tempo, piano-roll preview, simplified piano/drum score previews, track visibility toggles, editing draft controls, warnings, saved-draft status, and original/draft MIDI/MusicXML export actions.
5. Select notes from the piano roll or event lists, use Ctrl/Cmd-click for additive selection, or drag a selection box in the piano roll to select multiple notes.
6. Drag the current selection horizontally to move timing, quantize selected notes or the whole draft, reassign selected drum hits to a different lane, draw a box over a piano-only or drum-only time region when you want to re-transcribe that section, run `Analyze draft` to fetch heuristic correction suggestions, apply any suggestion you want to accept, use keyboard shortcuts such as `Ctrl/Cmd+Z`, `Ctrl/Cmd+Y`, `Delete`, arrow keys, and `Q`, then click `Save draft`.
7. Open `/projects` and confirm the completed job now appears in the local project library.
8. Refresh or reopen the same completed job flow and confirm the saved draft auto-loads separately from the original completed result.
9. Open `/projects`, use `Export project package` on a completed project, then import the resulting zip package and confirm the imported project appears as a separate local project with a new `projectId`.

To try the optional stronger separation backend locally, set environment variables before starting the API or `npm run dev`. Example PowerShell:

```powershell
$env:SOURCE_SEPARATION_PROVIDER = "demucs"
$env:SOURCE_SEPARATION_FALLBACK_PROVIDER = "development-copy"
$env:SOURCE_SEPARATION_DEMUCS_PYTHON = "C:\path\to\python.exe"
```

To try the optional stronger piano backend locally, set environment variables before starting the API or `npm run dev`. Example PowerShell:

```powershell
$env:PIANO_TRANSCRIPTION_PROVIDER = "ml"
$env:PIANO_TRANSCRIPTION_FALLBACK_PROVIDER = "heuristic"
$env:PIANO_TRANSCRIPTION_ML_PYTHON = "C:\path\to\python.exe"
```

To try the optional stronger drum backend locally, set environment variables before starting the API or `npm run dev`. Example PowerShell:

```powershell
$env:DRUM_TRANSCRIPTION_PROVIDER = "ml"
$env:DRUM_TRANSCRIPTION_FALLBACK_PROVIDER = "heuristic"
$env:DRUM_TRANSCRIPTION_ML_PYTHON = "C:\path\to\python.exe"
```

Current real transcription support:

- uncompressed PCM `.wav` stems
- 8-bit, 16-bit, or 32-bit PCM WAV sample widths
- simple monophonic or lightly overlapping piano phrases work best for piano
- simple onset-heavy percussive material works best for drums

Current limitations:

- the default source separation provider is still the development copy backend unless you explicitly configure another provider
- the optional Demucs backend is stronger than the copy provider, but it is only used when Demucs is installed in the configured Python environment and runnable from the local machine
- the current Demucs integration normalizes `drum_stem` from Demucs `drums.wav` and normalizes `piano_stem` from a configurable non-drum source, which defaults to `other.wav`; that means the returned piano stem may still contain non-piano accompaniment
- the default piano transcription provider is still the heuristic WAV backend unless you explicitly configure another provider
- the optional Basic Pitch backend is stronger than the heuristic fallback, but it is only used when `basic-pitch` is installed in the configured Python environment and runnable from the local machine
- Basic Pitch validation has not been completed in this repository environment yet, so the current implementation documents and tests provider selection, normalization, and fallback behavior without claiming production-ready ML accuracy
- real piano transcription fallback currently runs only on uncompressed PCM `.wav` stems
- the default drum transcription provider is still the heuristic WAV backend unless you explicitly configure another provider
- the optional madmom-backed drum backend is stronger than the heuristic fallback, but it is only used when `madmom` is installed in the configured Python environment and runnable from the local machine
- madmom validation has not been completed in this repository environment yet, so the current implementation documents and tests provider selection, normalization, and fallback behavior without claiming production-ready ML accuracy
- real drum transcription fallback currently runs only on uncompressed PCM `.wav` stems
- the heuristic piano provider is intentionally lightweight and may simplify or miss dense polyphonic passages
- the current Basic Pitch integration normalizes note start/end/pitch/confidence output into the existing `NoteEvent` shape, but it does not yet add provider-specific controls such as sustain-pedal reasoning or piano-only post-filters
- the heuristic drum provider is intentionally lightweight and may simplify or misclassify dense drum-kit material
- the current madmom integration uses a stronger ML-backed onset path but still maps final drum lanes back into the stable `kick` / `snare` / `hi-hat` labels expected by the current editor workflow
- region re-transcription reuses the same persisted stems and configured transcription providers as the main job, so its quality remains bounded by the same source separation and provider limitations
- region re-transcription currently extracts and re-transcribes only persisted PCM `.wav` stem segments; it does not rerun source separation or change the stored original `JobResult`
- a valid region may legitimately return `notes: []`; this is treated as a successful re-transcription result rather than an error
- AI-assisted correction runs only against the current editable draft and returns heuristic suggestions, not automatic edits or model-validated guarantees
- suggestion state is ephemeral editor UI state and is not persisted as part of the saved draft snapshot
- drum-pattern and velocity suggestions are intentionally conservative in Phase 11F and may miss many real issues rather than over-editing user drafts
- post-processing now does more cleanup than Phase 5, but it still assumes a simple 4/4 grid and a single project-wide tempo estimate rather than a tempo map
- tempo estimation is still heuristic; sparse, rubato, or heavily syncopated material may return only an approximate BPM or fall back to 120 BPM with a warning
- quantization now chooses between simple eighth-note and sixteenth-note grids based on the detected timing evidence, but it does not model tuplets, swing, or notation-specific phrasing
- duplicate removal and overlap trimming are intentionally conservative cleanup passes, not a DAW-grade performance-edit model
- MIDI export currently assumes the same single tempo and quantized timing already produced by the backend post-processing stage
- MusicXML export currently assumes the same single tempo and 4/4 grid, and focuses on structural compatibility rather than engraving quality
- the piano score preview is intentionally simplified, currently shows only the first visible piano track, and focuses on inspection rather than engraving fidelity
- the drum preview is notation-oriented but lane/grid based rather than full percussion staff engraving, and currently shows only the first visible drum track
- the latest saved draft is persisted separately from the original completed result, but only one saved draft snapshot is kept per job
- edited draft notes now receive stable `draftNoteId` values used for selection and note operations
- saved draft versioning is minimal and increments a single integer per save; there is no delete endpoint, rollback history, or branching yet
- undo/redo history is session-local and is not persisted as saved draft revision history
- backend edited export override payloads are now validated and rejected when note timing, pitch, duration, or track structure is invalid
- preview panes currently limit notation-style rendering to the first 8 bars for readability
- there are no stem download endpoints yet; the UI currently exposes metadata and storage paths only
- job state is still in-memory and is lost when the API restarts
- saved drafts are local-development files only and are not yet tied to accounts, cross-device sync, or public ownership rules
- the Phase 12 project library is filesystem-driven from local manifests and does not depend on the in-memory `job_store` for persisted project listing/detail
- `original-result.json` is written once when a job completes and is not overwritten by draft saves, re-transcription, or in-session edits
- `/projects/{projectId}` is a stable local route for reopening persisted project state, not a resume/recovery path for background jobs
- deleted projects are hidden from library/detail routes immediately; local file cleanup is attempted best-effort in the same local filesystem
- shareable project links are local deployment routes only; they are not public internet-safe share tokens and do not add auth, permissions, or anonymous publishing
- the live managed project directory remains lightweight in Phase 13L; source uploads and stems still live in the existing local uploads/stems stores rather than being migrated into each live project directory
- portable zip packages aggregate manifest/original-result/saved-draft plus local source-upload and stem assets when those files exist; missing optional assets are not faked
- runtime guidance and startup preflight are local-instance checks only; they do not add cloud hosting, account ownership, or remote deployment orchestration
- app-mode browser auto-open is best-effort and can be disabled; headless or restricted environments may no-op instead of launching a browser
- open-local imports a valid external project folder into the managed library rather than editing it in place
- opening the same external local project folder multiple times currently creates multiple imported local project instances unless the selected path is already one of this deployment's managed project directories
- this `open-local` behavior is the intended Phase 13L model; a later phase may choose a more direct open-in-place or reference-based model if the product needs it
- portable import restores source bundle content as a new independent local project instance; it does not reuse the source package `projectId` or pretend to recover background execution state
- current hosted assumptions remain single-instance plus persistent disk/volume mounted under `apps/api/data`; multi-instance coordination and job recovery are deferred

## Validation Performed

Recommended local validation commands:

- `npm run app:check`
- `npm run typecheck`
- `npm run test:music-engine`
- `npm run test:api`
- `npm run validate`

Current validation reality:

- `npm run validate` now runs workspace typecheck, focused `packages/music-engine` editing tests, and backend unittest discovery through the project venv
- backend tests require `apps/api/requirements-dev.txt` because `fastapi.testclient` depends on `httpx`
- frontend lint is still not part of the reliable validation workflow because the repo does not yet include a completed ESLint setup and `next lint` still opens the interactive Next.js configuration prompt

## What Is Not Implemented Yet

- production-validated source separation quality tuning across multiple real-world audio sets
- production-validated piano transcription quality tuning across multiple real-world audio sets
- production-validated drum transcription quality tuning across multiple real-world audio sets
- persisted multi-revision edit history or saved projects
- desktop packaging and installer workflows
- full bilingual UI copy coverage and language switching UX
- user accounts or authentication
- database-backed ownership rules
- real public sharing or permission systems
- cloud storage and multi-device sync
- background job recovery after API restart

## Future Roadmap

- Completed baseline: Phase 11A through Phase 11F, Phase 12 MVP, Phase 12.5, Phase 13L, and Phase 14L are in place while preserving the normalized `JobResult` contract and the original-result vs saved-draft boundary
- Phase 15L - Desktop Application Packaging (Optional / Future):
  - wrap the existing local app in a desktop shell such as Electron or Tauri
  - add a desktop bridge interface only if packaging requires it
  - improve OS-level integration such as native file dialogs or menus
  - keep desktop packaging optional rather than required for core product viability
- Explicitly deferred (not near-term):
  - accounts and authentication
  - cloud storage and database-backed ownership models
  - public sharing and permission systems
  - multi-device sync
  - background job recovery
