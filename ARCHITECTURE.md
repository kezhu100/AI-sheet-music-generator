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
- later quantization helpers
- later note event transforms
- later beat/bar alignment logic

## Processing Pipeline

1. upload audio
2. create processing job
3. route audio through the source separation provider
4. persist stems
5. run heuristic piano transcription on the persisted piano stem when supported
6. run heuristic drum transcription on the persisted drum stem when supported
7. normalize to the common event schema
8. merge into a job result
9. return normalized result assets to the frontend

Current runtime note:
- step 3 is implemented with a local development separation backend that copies the uploaded file into per-job stems
- step 5 is implemented with a stdlib-only heuristic piano provider for uncompressed PCM `.wav` stems
- step 6 is implemented with a stdlib-only heuristic drum provider for uncompressed PCM `.wav` stems

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
- `stems`: normalized stem metadata for persisted outputs
- `tracks`: normalized track results used by the frontend
- `warnings`: explicit limitations and runtime caveats

This keeps the frontend consuming normalized backend results rather than backend-specific storage details.

## Design Principles

- provider-based model integrations
- stable internal schemas
- minimal cohesive changes per phase
- export logic should remain independent from ML providers
- frontend should consume normalized results only
