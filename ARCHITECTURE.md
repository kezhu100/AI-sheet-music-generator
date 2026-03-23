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
- a verification-first information hierarchy
- export and editing separation in the UI
- advanced technical detail moved behind a collapsed disclosure
- stronger bilingual user-facing copy in the main workflow
- a restrained manuscript / fantasy / Celtic visual system implemented through CSS and SVG-style ornamentation only

It does not add:
- persistence model changes
- provider architecture changes
- cloud features

Small additive contract refinements are allowed when they stay architecture-safe, such as exposing runtime provider availability options and accepting per-job provider preferences without changing the normalized `JobResult` boundary.

Another additive contract refinement now extends `ProcessingPreferences` with a dedicated piano post-processing settings block.
This keeps the normalized `JobResult` unchanged while letting the frontend, API, persisted project manifests, reruns, and region re-transcription share the same project-local cleanup settings.

## Additive Provider Capability Layer (Backend Foundation)
An additive backend foundation now exists for optional enhanced providers.

This layer does not change the transcription pipeline stages or `JobResult`.
It adds:
- provider capability manifest metadata per option (id, category, display name, built-in vs optional-enhanced, recommended)
- richer runtime provider-option diagnostics (installed/available/installable/missing-reason/help/status text)
- explicit backend-owned install actions for optional enhanced providers only
- backend-owned local install state and install logs under the local data directory

This provider foundation is now split more explicitly:
- built-in base providers remain the default local fast path
- the official enhanced-provider set is fixed and explicit:
  - demucs
  - basic-pitch
  - demucs-drums
- future extra providers should not be added as new built-in official enhanced providers
- future extra providers should instead enter through a controlled custom-provider extension path

The first custom-provider extension path is intentionally narrow:
- install source type is manifest-driven only
- the backend currently accepts only a local `file://` manifest URL
- the backend validates the manifest structure, validates declared local asset URLs, and copies those files into app-managed local storage
- custom provider registration is backend-owned and persisted locally
- this step does not add arbitrary command execution, arbitrary script installers, provider discovery, or automatic pipeline wiring for custom providers

This layer preserves:
- built-in baseline providers as default runnable behavior
- existing `Auto` preference defaults
- existing fallback behavior when stronger providers are unavailable
- no cloud dependencies

## Frontend Composition
The main workspace now follows this structure:
1. Hero and primary action area
2. Upload or project entry
3. Main verification preview
4. Editing area
5. Export area
6. Advanced Details (collapsed by default)

Advanced Details contains runtime/provider summaries, stems, warnings, and note-detail views that are still available for inspection.
The primary preview surfaces remain lightweight and verification-oriented, while final notation polishing is expected to happen after MusicXML export in MuseScore.
Draft editing remains in place for quick fixes before export rather than as a full in-browser notation-editing system.

## Processing Pipeline
The processing pipeline remains:
1. upload audio
2. create processing job
3. backend-local audio normalization / ffmpeg transcoding into a job-scoped PCM WAV intermediate when needed
4. source separation via the configured provider
5. persist separated stems, including raw piano stem retention for comparison when filtering is enabled
6. optional backend-owned piano stem pre-filtering before piano transcription
7. piano transcription via the configured provider
8. drum transcription via the configured provider
9. backend-owned post-processing and normalization, including controllable piano cleanup after transcription
10. deliver normalized `JobResult`
11. clone to frontend draft for editing
12. save/load latest draft separately when requested
13. export piano-only or drums-only MIDI/MusicXML from original or draft result

Notes:
- compatible PCM WAV uploads still pass through this stage without requiring ffmpeg transcoding
- compressed/common consumer formats such as `.mp3`, `.m4a`, `.aac`, and `.flac` now rely on a local `ffmpeg` dependency rather than being passed raw into downstream providers
- upload ingestion now streams files to local disk and enforces a configurable backend size limit before later pipeline stages begin

## Frontend / Backend Boundary
Phase 14.5 preserves the current boundary:
- the backend still owns runtime diagnostics, persistence, and export generation
- the frontend still owns preview rendering, draft editing interactions, and workspace composition
- the web app consumes normalized backend results rather than backend storage details
- exporter-side grouping now derives separate piano-only or drums-only files from the normalized `JobResult` without changing the shared result contract
- drums-only MusicXML keeps exporter-owned lightweight percussion semantics for MuseScore import quality, without introducing a larger engraving subsystem

The verification/handoff refinement keeps the same boundary:
- the backend may expose persisted local stems for read-only browser audition without changing `JobResult`
- the frontend may use those persisted assets for compact verification playback only, including a filtered piano default plus optional raw comparison
- export stays backend-owned, and MuseScore handoff remains download-based rather than OS-launch-based, with separate piano/drum MusicXML as the recommended path

Provider install behavior follows the same boundary:
- install logic is backend-owned and explicit
- frontend should only trigger install actions and render structured backend status
- heavy optional downloads are never forced during normal app startup
- custom-provider registration status is queryable through the same backend-owned install-status layer
- runtime diagnostics surface custom providers distinctly from official enhanced options instead of folding them into the fixed official set

Processing-control behavior follows the same boundary:
- the frontend owns the single-column settings composition plus the simple two-layer control presentation
- the frontend keeps Model Selection and Processing Pipeline as distinct top-level sections
- the backend owns preset mapping, cleanup semantics, and post-processing execution
- the backend now also resolves pre-processing presets and custom overrides before piano stem filtering runs
- project/job persistence stores processing preferences additively so older saved projects without the new fields still load through defaults
- `pianoFilter` remains the persisted pre-processing key for compatibility, but now carries `enabled`, `preset`, `basePreset`, and advanced parameter fields

## Future Direction
- preserve the current local-first browser architecture
- keep desktop packaging optional in Phase 15L
- continue refining usability without destabilizing core contracts
- avoid spending roadmap effort on richer in-browser engraving when export + MuseScore handoff covers the final-notation path
