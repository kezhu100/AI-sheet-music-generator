# ARCHITECTURE.md

## High-Level Architecture

## Runtime Model

- The system runs as local backend services plus a browser-based frontend.
- It behaves like a desktop-like local application without requiring a desktop shell.
- Phase 14 focuses on local deployment and one-click startup, while Phase 15 keeps desktop packaging optional.

## Phase 12 Summary

Phase 12 adds a small project-facing persistence layer on top of the existing pipeline:
- a filesystem-backed project manifest is now the source of truth for the local project library
- the completed backend result is persisted once as an immutable `original-result.json`
- the saved latest draft remains in the separate draft store
- project reopen routes use persisted project state only and do not resume background execution

## Phase 12.5 Summary

Phase 12.5 extends the same project-facing layer without changing the core result model:
- project rename, delete, and duplicate actions are manifest-backed project-management operations
- duplication creates a new local project/job identity and namespaces duplicated draft-level note ids
- persisted completed projects can now fall back to filesystem-backed project data for draft/export workflows when no in-memory job is present
- project list/detail UIs now consume clearer manifest status metadata and locale-ready labels without introducing accounts or cloud assumptions

## Phase 13L Summary

Phase 13L adds explicit local project portability without replacing the current live storage model:
- the managed local project library remains the live source of truth
- live project directories stay lightweight: `manifest.json` plus immutable `original-result.json`
- saved drafts remain in the separate draft store
- portable project handoff and backup now use an explicit zip package format
- package import always creates a new local project/job identity and re-namespaces imported draft note ids

## Roadmap Direction (Post-Phase 12)

Strategic direction:
- local-first, installable, browser-based local application with optional future desktop packaging

Near-term architecture priorities:
- local project/file management ergonomics
- broader bilingual UI coverage beyond the new locale-ready project labels
- local deployment and one-click startup
- local environment/runtime configuration and checks
- onboarding and demo workflows

De-prioritized to deferred track:
- accounts and authentication
- cloud/object storage ownership models
- public sharing and permission systems
- multi-device sync
- SaaS-first infrastructure

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
3. route audio through the configured source separation provider
4. persist stems
5. run the configured piano transcription provider on the persisted piano stem when supported
6. run the configured drum transcription provider on the persisted drum stem when supported
7. run backend-owned post-processing for confidence-aware cleanup, weighted tempo estimation, adaptive quantization, duplicate cleanup, track merge, and beat/bar alignment
8. normalize timing through reusable helper boundaries
9. normalize to the common event schema
10. merge into a job result
11. optionally load or save the latest edited draft snapshot for the completed job
12. optionally re-transcribe a selected piano or drum region from the persisted stem and return normalized replacement notes for the current draft only
13. optionally analyze the current editable draft and return heuristic correction suggestions only
14. generate MIDI or MusicXML on demand from either the original normalized result or a validated draft override when requested
15. return normalized result assets to the frontend

Current runtime note:
- step 3 now supports multiple source separation providers behind the same provider boundary
- the default provider is still the development copy backend for predictable local setup
- an optional Demucs-backed provider can generate stronger persisted stems when its runtime is configured
- the stronger provider path can fall back to the development copy provider without changing API routes or downstream result contracts
- step 5 now supports multiple piano transcription providers behind the same provider boundary
- the default piano transcription provider is still the heuristic WAV backend for predictable local setup
- an optional Basic Pitch-backed provider can generate stronger normalized piano note events when its runtime is configured
- the stronger piano provider path can fall back to the heuristic provider without changing downstream contracts
- step 6 now supports multiple drum transcription providers behind the same provider boundary
- the default drum transcription provider is still the heuristic WAV backend for predictable local setup
- an optional madmom-backed provider can generate stronger normalized drum hit events when its runtime is configured
- the stronger drum provider path can fall back to the heuristic provider without changing downstream contracts
- step 7 is implemented with a richer backend post-processing stage that still reuses the existing `bpm`, `bar`, and `beat` fields instead of introducing a new timing schema
- step 8 is implemented through small timing helper modules rather than page-local or pipeline-local ad hoc calculations
- step 11 is currently implemented with a local file-backed draft store under `apps/api/data/drafts`
- step 12 is currently implemented with stdlib-only backend MIDI and MusicXML exporters that use either the completed `JobResult` or a validated override payload
- Phase 12 MVP now adds a filesystem-backed project manifest layer under `apps/api/data/projects/<project-id>/manifest.json`
- completed jobs now also persist an immutable `original-result.json` once under the same project directory
- project listing/detail routes read project manifests first and do not require the in-memory `job_store` for reopening persisted completed projects

## Provider Design

### Source Separation Providers
- backend contract lives under `apps/api/app/pipeline/interfaces.py`
- current implementation lives in `apps/api/app/pipeline/source_separation.py`
- provider selection is configured through backend settings and environment variables rather than being hard-wired inside the job runner
- `development-copy` persists placeholder stems by copying the upload into per-job files
- `demucs` can run a stronger external separation backend through a configurable Python executable and model name
- fallback selection can automatically return to `development-copy` when the stronger backend is unavailable
- persisted outputs are still normalized into the same `piano_stem` and `drum_stem` metadata expected by downstream transcription
- the current Demucs integration maps `drum_stem` from `drums.wav` and maps `piano_stem` from a configurable non-drum output, defaulting to `other.wav`

### Piano Transcription Providers
- backend contract lives under `apps/api/app/pipeline/interfaces.py`
- current implementation lives in `apps/api/app/pipeline/piano_transcription.py`
- provider selection is configured through backend settings and environment variables rather than being hard-wired inside the pipeline factory
- `heuristic` uses only the Python standard library and returns normalized piano `NoteEvent` values from PCM `.wav` stems
- `ml` and `basic-pitch` currently resolve to a stronger Basic Pitch-backed provider that can run through a separate Python executable
- fallback selection can automatically return to `heuristic` when the stronger backend is unavailable
- the stronger provider normalizes raw note start/end/pitch/confidence outputs into the existing `NoteEvent` shape before post-processing
- the current heuristic provider remains intentionally lightweight and optimized for simple note output rather than dense polyphonic accuracy

### Drum Transcription Providers
- backend contract lives under `apps/api/app/pipeline/interfaces.py`
- current implementation lives in `apps/api/app/pipeline/drum_transcription.py`
- provider selection is configured through backend settings and environment variables rather than being hard-wired inside the pipeline factory
- `heuristic` uses only the Python standard library and returns normalized drum `NoteEvent` values from PCM `.wav` stems
- `ml` and `madmom` currently resolve to a stronger madmom-backed provider that can run through a separate Python executable
- fallback selection can automatically return to `heuristic` when the stronger backend is unavailable
- the stronger provider uses ML-backed onset detection and then normalizes drum hits into the existing stable label and `midiNote` mapping expected by the editor workflow
- the current heuristic provider remains intentionally lightweight and optimized for simple onset-focused drum hit detection rather than full kit accuracy

## Shared Result Shape

`JobResult` currently includes:

- project metadata
- `bpm`: the current project-wide tempo estimate
- `stems`: normalized stem metadata for persisted outputs
- `tracks`: normalized track results used by the frontend
- `warnings`: explicit limitations and runtime caveats

This keeps the frontend consuming normalized backend results rather than backend-specific storage details.

Phase 11A separation boundary:
- `JobResult` remains unchanged
- `StemAsset.provider` records which source separation backend actually produced the persisted stem files
- separation fallback behavior is surfaced through warnings instead of contract-breaking schema changes
- downstream piano/drum transcription, preview, editing, persistence, and export still consume normalized persisted stems and normalized `JobResult`

Phase 11B piano transcription boundary:
- `JobResult` remains unchanged
- `TrackResult.provider` records which piano transcription backend actually produced the normalized note events
- piano-provider fallback behavior is surfaced through warnings instead of schema changes
- post-processing, preview, editing, persistence, and export still consume the same normalized `tracks[].notes` structure

Phase 11C drum transcription boundary:
- `JobResult` remains unchanged
- `TrackResult.provider` records which drum transcription backend actually produced the normalized note events
- drum-provider fallback behavior is surfaced through warnings instead of schema changes
- post-processing, preview, editing, persistence, and export still consume the same normalized `tracks[].notes` structure

Phase 5.5 timing helper boundaries:
- backend orchestration stays in `apps/api/app/pipeline/post_processing.py`
- backend timing math lives in `apps/api/app/pipeline/timing.py`
- frontend-facing reusable timing helpers live in `packages/music-engine/src/timing.ts`

Phase 11D post-processing boundaries:
- `apps/api/app/pipeline/post_processing.py` remains the orchestration entry point for final backend cleanup and normalization
- `apps/api/app/pipeline/post_processing_helpers.py` now owns richer cleanup and timing decisions such as weighted tempo estimation, adaptive grid selection, duplicate removal, overlap trimming, and cleanup-warning summaries
- provider modules still only emit normalized raw note events; they do not absorb post-processing responsibilities
- the frontend, draft persistence, preview, and export layers continue to consume the same normalized `JobResult`

Phase 11E region re-transcription boundary:
- backend region re-transcription orchestration lives in `apps/api/app/services/region_retranscription.py`
- the jobs API exposes `POST /api/v1/jobs/{jobId}/retranscribe-region` as a narrow hook that returns normalized region notes plus a small `providerUsed` diagnostic field
- region requests reuse persisted `piano_stem` / `drum_stem` files, existing transcription providers, and the same backend post-processing stage used by the main pipeline
- the original completed `JobResult` remains unchanged; the frontend applies returned notes only to the current editable draft
- providers still stay responsible only for transcribing their input segment, not for draft replacement or persistence rules

Phase 11F AI-assisted correction boundary:
- backend draft analysis lives in `apps/api/app/services/correction_analysis.py`
- the jobs API exposes `POST /api/v1/jobs/{jobId}/analyze-draft` as a narrow hook that accepts the current editable draft `JobResult` and returns suggestion objects only
- heuristic analysis consumes normalized draft tracks and timing helpers only; it does not change provider output, post-processing ownership, or the normalized `JobResult`
- the frontend displays suggestion markers and applies accepted suggestions back into the same editable draft using the existing editing-helper and undo/redo flow
- suggestion state is ephemeral editor state and is not persisted separately from the saved draft result

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
- editing helpers and normalization helpers live in `packages/music-engine/src/editing.ts`
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

Phase 10 editing UX boundary:
- reusable richer editing rules remain in `packages/music-engine/src/editing.ts`, including bulk selection lookup, multi-note delete/move, quantization helpers, piano transposition, and drum lane reassignment
- session-local undo/redo stacks and selection-state orchestration live in `apps/web/app/hooks/useEditableJobResult.ts`
- the hook stores history entries as draft `JobResult` snapshots plus selected draft-note ids; this keeps undo/redo separate from backend draft persistence
- `apps/web/app/components/PianoRollPreview.tsx` owns surface-specific interaction such as additive note clicks, box selection geometry, and drag gesture wiring
- `apps/web/app/components/NoteEditorPanel.tsx` owns editing affordances only: undo/redo buttons, quantize actions, and drum reassignment controls
- `apps/web/app/page.tsx` remains composition-oriented and wires flow, persistence, export, and high-level keyboard shortcuts without embedding note-editing rules directly
- original completed backend results, saved latest draft snapshots, and current in-session editable draft state remain distinct artifacts
- export still consumes validated normalized `JobResult` payloads and does not introduce a separate Phase 10 export schema

Phase 12 productization boundary:
- backend project metadata persistence lives in `apps/api/app/services/project_store.py`
- local project manifests are stored under `apps/api/data/projects/<project-id>/manifest.json`
- immutable completed originals are stored under `apps/api/data/projects/<project-id>/original-result.json` and are written only once on completion
- saved drafts remain in the existing `apps/api/data/drafts/<job-id>.json` store and do not overwrite the persisted original result
- the projects API now exposes `GET /api/v1/projects` and `GET /api/v1/projects/{projectId}` from filesystem-backed manifests
- the projects API now also exposes rename, duplicate, and delete actions for local project management
- the projects API now also exposes local-folder open, zip export-to-path, and zip import actions for local project packaging
- `/projects/{projectId}` in the web app is for reopening persisted project state only; it does not resume or recover background job execution after restart
- current hosted assumptions are single backend instance plus persistent local/shared disk; accounts, public sharing, multi-instance coordination, and job recovery remain deferred
- deleted projects are hidden at the manifest layer immediately, while local file cleanup remains best-effort in the same filesystem
- project rename updates manifest-backed display metadata only; it does not mutate the immutable persisted `original-result.json`
- duplication copies persisted original-result and saved-draft artifacts into a new local project/job namespace while preserving the original-result versus saved-draft split
- Phase 13L packaging lives in `apps/api/app/services/project_packaging.py`
- package export aggregates the lightweight live project plus optional upload/stem assets into a zip bundle instead of redesigning live storage
- package import restores local assets into the existing uploads/stems/drafts/projects stores and rewrites imported identities to a new local namespace
- local-folder open imports an external project folder into the managed library rather than opening it in place
- import validates the package format version, rejects unsafe archive paths, and enforces size limits before reading package content
- export refuses to overwrite an existing target file; imported asset restoration writes into new project-scoped storage paths and avoids overwriting existing local files
- the current `open-local` rule is intentionally import-into-library for Phase 13L, because local identity isolation and project-library consistency matter more here than path-coupled editing; a later phase may evolve this local opening model if needed
- package evolution should stay backward-compatible where practical: unknown package versions fail clearly, new fields should preferably be additive, and active local runtime identity must never depend on source package identity

Future roadmap boundaries:
- Phase 14L will add a clean local deployment mode with one-command or one-script startup for local backend services plus browser UI, environment/runtime checks, automatic browser open where appropriate, and clearer local configuration guidance while keeping the architecture local-first and browser-based
- Phase 15L will optionally wrap the same local app in a desktop shell such as Electron or Tauri, adding a desktop bridge only if packaging needs one and improving OS-level integration without changing core product viability

Validation boundary after Phase 10:
- backend unittest discovery runs through `scripts/test-api.mjs` and the project venv
- focused `packages/music-engine` editing coverage lives under `packages/music-engine/tests` and now includes richer bulk-editing helpers
- `npm run validate` is the reliable current repo-wide validation command
- frontend lint remains outside the reliable path until the repo adopts a real ESLint configuration and dependency set

## Design Principles

- provider-based model integrations
- stable internal schemas
- minimal cohesive changes per phase
- export logic should remain independent from ML providers
- frontend should consume normalized results only
- post-processing should stay backend-owned and practical rather than DAW-grade, even as later phases make the cleanup heuristics richer
- preview rendering should stay decoupled from editing behavior and avoid forcing backend contract changes before Phase 8
- Phase 8 editing should stay draft-oriented and avoid introducing persistence until the product explicitly needs saved edits
- Phase 9 draft persistence should extend the existing draft model rather than collapsing edited state into the original job result
- Phase 10 editing UX should extend the same normalized draft model and keep UI gesture logic separate from reusable editing rules
- Phase 12 productization should add project-facing persistence and routes on top of the existing original-result versus saved-draft boundary rather than collapsing them into one model
- post-Phase-12 roadmap work should prioritize local deployment UX and project portability before any optional desktop shell work or SaaS-oriented ownership/cloud concerns
