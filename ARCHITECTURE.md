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
5. select transcription provider per stem
6. transcribe each stem
7. normalize to the common event schema
8. merge into a job result
9. return normalized result assets to the frontend

Current Phase 2 runtime note:
- step 3 is implemented with a local development separation backend
- step 4 is real local file persistence
- steps 5 and 6 still use mocked piano and drum transcription providers

## Provider Design

### Source Separation Providers
- backend contract lives under `apps/api/app/pipeline/interfaces.py`
- current implementation lives in `apps/api/app/pipeline/source_separation.py`
- current backend persists placeholder stems by copying the upload into per-job files
- later providers can swap in validated ML separation without changing API routes

### Piano Transcription Providers
- provider abstraction remains in place
- runtime output is still mocked in Phase 2

### Drum Transcription Providers
- provider abstraction remains in place
- runtime output is still mocked in Phase 2

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
