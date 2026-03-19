# ARCHITECTURE.md

## High-Level Runtime Model
The system runs as a local browser frontend plus local backend services.

Current architecture:
- Frontend: Next.js
- Backend: FastAPI
- Storage: local filesystem
- Shared contract: `JobResult`
- Runtime mode: local-first, no cloud dependency

## Stable Architecture Constraints
These architectural rules remain unchanged after Phase 14.5:
- keep `JobResult` as the core shared result shape
- keep original completed result, saved latest draft, and in-session draft as separate artifacts
- keep provider-based source separation and transcription boundaries intact
- keep export generation backend-owned
- keep project storage local and filesystem-backed
- do not add cloud, auth, or SaaS assumptions

## Phase 14L Summary
Phase 14L added:
- one-command local startup
- runtime diagnostics
- clearer local deployment flow
- browser-oriented local app startup without requiring a desktop shell

## Phase 14.5 Summary
Phase 14.5 is a frontend product-presentation refinement layer on top of Phase 14L.

It adds:
- a single shared workspace shell for home and project routes
- a score-first information hierarchy
- export and editing separation in the UI
- advanced technical detail moved behind a collapsed disclosure
- stronger bilingual user-facing copy in the main workflow
- a restrained manuscript / fantasy / Celtic visual system implemented through CSS and SVG-style ornamentation only

It does not add:
- backend contract changes
- persistence model changes
- provider architecture changes
- cloud features

## Frontend Composition
The main workspace now follows this structure:
1. Hero and primary action area
2. Upload or project entry
3. Main result preview with score first
4. Editing area
5. Export area
6. Advanced Details (collapsed by default)

Advanced Details contains runtime/provider summaries, stems, warnings, and note-detail views that are still available for inspection.

## Processing Pipeline
The processing pipeline remains:
1. upload audio
2. create processing job
3. source separation via the configured provider
4. persist stems
5. piano transcription via the configured provider
6. drum transcription via the configured provider
7. backend-owned post-processing and normalization
8. deliver normalized `JobResult`
9. clone to frontend draft for editing
10. save/load latest draft separately when requested
11. export MIDI or MusicXML from original or draft result

## Frontend / Backend Boundary
Phase 14.5 preserves the current boundary:
- the backend still owns runtime diagnostics, persistence, and export generation
- the frontend still owns preview rendering, draft editing interactions, and workspace composition
- the web app consumes normalized backend results rather than backend storage details

## Future Direction
- preserve the current local-first browser architecture
- keep desktop packaging optional in Phase 15L
- continue refining usability without destabilizing core contracts
