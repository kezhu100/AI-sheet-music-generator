# ARCHITECTURE.md

## High-Level Architecture

### Frontend
`apps/web`

Responsibilities:
- upload audio
- create processing jobs
- display status
- show stems, tracks, and note events
- expose current limitations clearly
- later support export and score preview flows

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
11. generate MIDI on demand from the normalized result when requested
12. return normalized result assets to the frontend

Current runtime note:
- step 3 is implemented with a local development separation backend that copies the uploaded file into per-job stems
- step 5 is implemented with a stdlib-only heuristic piano provider for uncompressed PCM `.wav` stems
- step 6 is implemented with a stdlib-only heuristic drum provider for uncompressed PCM `.wav` stems
- step 7 is implemented with a lightweight backend post-processing stage that reuses the existing `bpm`, `bar`, and `beat` fields
- step 8 is implemented through small timing helper modules rather than page-local or pipeline-local ad hoc calculations
- step 11 is currently implemented with a stdlib-only backend MIDI exporter that uses the completed `JobResult`

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
- the jobs API exposes a dedicated on-demand download endpoint rather than bloating `JobResult`

## Design Principles

- provider-based model integrations
- stable internal schemas
- minimal cohesive changes per phase
- export logic should remain independent from ML providers
- frontend should consume normalized results only
- post-processing should stay lightweight until later export or notation phases demand richer timing models
