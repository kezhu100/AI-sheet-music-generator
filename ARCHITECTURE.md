# ARCHITECTURE.md

## High-Level Architecture

### Frontend
`apps/web`

Responsibilities:
- upload audio
- create processing jobs
- display status
- show stems, tracks, and note events
- render score-preview UI from normalized result tracks
- expose current limitations clearly
- support export and score preview flows

### Backend
`apps/api`

Responsibilities:
- receive upload metadata
- store input files
- orchestrate the job pipeline
- run source separation through provider interfaces
- persist generated stems
- run transcription providers
- transform completed results into export assets on demand
- persist the latest saved edited draft separately from the completed job result
- normalize outputs
- expose result APIs

### Shared Types
`packages/shared-types`

Responsibilities:
- shared request/response schemas
- note event schema
- job state types
- stem metadata DTOs

### Music Engine
`packages/music-engine`

Responsibilities:
- reusable result summarization helpers
- frontend-facing timing display helpers
- reusable timing math helpers for frontend-facing consumption
- frontend score-preview helper functions for track filtering, bar grouping, pitch naming, and notation-oriented layout math
- later note event transforms
- later beat/bar alignment logic
- later export-facing transforms when sharing logic is worthwhile

## Processing Pipeline

1. upload audio
2. create processing job
3. route audio through the source separation provider
4. persist stems
5. run heuristic piano transcription on the persisted piano stem when supported
6. run heuristic drum transcription on the persisted drum stem when supported
7. run lightweight post-processing for confidence filtering, tempo estimation, quantization, track merge, and beat/bar alignment
8. normalize timing through reusable helper boundaries
9. normalize to the common event schema
10. merge into a job result
11. optionally load or save the latest edited draft snapshot for the completed job
12. generate MIDI or MusicXML on demand from either the original normalized result or a validated draft override when requested
13. return normalized result assets to the frontend

Current runtime note:
- step 3 is implemented with a local development separation backend that copies the uploaded file into per-job stems
- step 5 is implemented with a stdlib-only heuristic piano provider for uncompressed PCM `.wav` stems
- step 6 is implemented with a stdlib-only heuristic drum provider for uncompressed PCM `.wav` stems
- step 7 is implemented with a lightweight backend post-processing stage that reuses the existing `bpm`, `bar`, and `beat` fields
- step 8 is implemented through small timing helper modules rather than page-local or pipeline-local ad hoc calculations
- step 11 is currently implemented with a local file-backed draft store under `apps/api/data/drafts`
- step 12 is currently implemented with stdlib-only backend MIDI and MusicXML exporters that use either the completed `JobResult` or a validated override payload

## Provider Design

### Source Separation Providers
- backend contract lives under `apps/api/app/pipeline/interfaces.py`
- current implementation lives in `apps/api/app/pipeline/source_separation.py`
- current backend persists placeholder stems by copying the upload into per-job files
- later providers can swap in validated ML separation without changing API routes

### Piano Transcription Providers
- backend contract lives under `apps/api/app/pipeline/interfaces.py`
- current implementation lives in `apps/api/app/pipeline/piano_transcription.py`
- current provider uses only the Python standard library and returns normalized piano `NoteEvent` values
- current provider is intentionally heuristic and optimized for simple note output rather than dense polyphonic accuracy

### Drum Transcription Providers
- backend contract lives under `apps/api/app/pipeline/interfaces.py`
- current implementation lives in `apps/api/app/pipeline/drum_transcription.py`
- current provider uses only the Python standard library and returns normalized drum `NoteEvent` values
- current provider is intentionally heuristic and optimized for simple onset-focused drum hit detection rather than full kit accuracy

## Shared Result Shape

`JobResult` currently includes:

- project metadata
- `bpm`: the current project-wide tempo estimate
- `stems`: normalized stem metadata for persisted outputs
- `tracks`: normalized track results used by the frontend
- `warnings`: explicit limitations and runtime caveats

This keeps the frontend consuming normalized backend results rather than backend-specific storage details.

Phase 5.5 timing helper boundaries:
- backend orchestration stays in `apps/api/app/pipeline/post_processing.py`
- backend timing math lives in `apps/api/app/pipeline/timing.py`
- frontend-facing reusable timing helpers live in `packages/music-engine/src/timing.ts`

Phase 6 export boundary:
- MIDI export generation lives in `apps/api/app/services/midi_export.py`
- MusicXML export generation lives in `apps/api/app/services/musicxml_export.py`
- the jobs API exposes a dedicated on-demand download endpoint rather than bloating `JobResult`

Phase 7 preview boundary:
- preview rendering lives in `apps/web/app/components`
- preview orchestration stays in `apps/web/app/page.tsx`
- preview math helpers live in `packages/music-engine/src/preview.ts`
- the backend remains unchanged and still returns the same normalized `JobResult`

Phase 8 editing boundary:
- the web app keeps a frontend-only draft `JobResult` cloned from the completed backend result
- editing state and normalization helpers live in `packages/music-engine/src/editing.ts`
- note selection now uses stable per-draft `draftNoteId` values attached during draft cloning
- note updates, add/delete behavior, drum-note defaults, and edited-result normalization are centralized in `packages/music-engine/src/editing.ts`
- `apps/web/app/hooks/useEditableJobResult.ts` now owns most draft-state orchestration (`isDraftDirty`, reset-to-original, note selection, and export override wiring)
- `apps/web/app/page.tsx` stays focused on upload/job flow plus UI composition
- piano-roll interaction remains in `apps/web/app/components/PianoRollPreview.tsx`
- edited export uses narrow POST overrides to the existing jobs export endpoints instead of mutating backend job state
- backend override validation lives in `apps/api/app/models/schemas.py` and is rechecked in `apps/api/app/api/jobs.py` before exporter execution

Phase 9 persistence boundary:
- backend draft persistence lives in `apps/api/app/services/draft_store.py`
- local draft files are stored under `apps/api/data/drafts/<job-id>.json`
- the jobs API now exposes `GET /api/v1/jobs/{jobId}/draft` and `PUT /api/v1/jobs/{jobId}/draft`
- each saved draft stores a full edited `JobResult` plus minimal metadata (`jobId`, `version`, `savedAt`)
- the original completed `job.result` remains the source artifact in `JobStore` and is never overwritten by draft saves
- the frontend auto-loads a saved draft when one exists and keeps export choices explicit between original result and current draft
- export still operates on validated normalized `JobResult` payloads rather than a separate export-only schema

Validation boundary after the Phase 8 wrap-up:
- backend unittest discovery runs through `scripts/test-api.mjs` and the project venv
- focused `packages/music-engine` editing coverage lives under `packages/music-engine/tests`
- `npm run validate` is the reliable current repo-wide validation command
- frontend lint remains outside the reliable path until the repo adopts a real ESLint configuration and dependency set

## Design Principles

- provider-based model integrations
- stable internal schemas
- minimal cohesive changes per phase
- export logic should remain independent from ML providers
- frontend should consume normalized results only
- post-processing should stay lightweight until later export or notation phases demand richer timing models
- preview rendering should stay decoupled from editing behavior and avoid forcing backend contract changes before Phase 8
- Phase 8 editing should stay draft-oriented and avoid introducing persistence until the product explicitly needs saved edits
- Phase 9 draft persistence should extend the existing draft model rather than collapsing edited state into the original job result
