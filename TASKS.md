# TASKS.md

## Completed Through Phase 14L
- repository bootstrap
- upload and job pipeline
- streamed upload persistence with configurable server-side size guard
- local ffmpeg-based audio normalization for common input formats
- source separation
- piano transcription
- drum transcription
- post-processing
- export
- score preview
- editing
- editing persistence
- editing UX improvements
- provider and quality upgrades
- project library / local project system
- local deployment and one-click startup

## Phase 14.5 - Workspace Product Polish
- [x] unify home and project workspace around one shared layout shell
- [x] make the score preview the primary result surface
- [x] reduce piano-roll dominance with a compact scrollable viewport
- [x] separate editing and export into clearer product sections
- [x] move runtime/provider/stem/warning/raw-note details into a collapsed advanced area
- [x] simplify editing panel wording and grouping without changing editing behavior
- [x] tighten action hierarchy between primary, secondary, and advanced actions
- [x] add restrained manuscript / fantasy / Celtic-inspired visual polish through CSS
- [x] remove garbled Chinese text and improve bilingual UI wording in the main workflow
- [x] update core documentation to reflect the new page structure and positioning
- [x] standardize core UI terms and refine two-line bilingual presentation on major library/workspace headings
- [x] simplify Project Library action hierarchy while preserving useful local project workflows
- [x] stabilize long score-preview browsing with fixed-height internal-scroll preview readers
- [x] expose Advanced Runtime Options near upload/start with Auto defaults, provider availability, and per-job provider preferences
- [x] align homepage, library, and workspace visuals around an artwork-inspired fantasy music hero language without sacrificing readability

## Phase 15L - Desktop Packaging (Optional / Future)
- [ ] evaluate optional packaging direction (Electron, Tauri, or equivalent)
- [ ] wrap the existing local app in a desktop shell if packaging is pursued
- [ ] introduce a typed desktop bridge only if packaging requires it
- [ ] add OS-level integration where worthwhile
- [ ] keep desktop packaging optional rather than required for core product viability

## Optional Enhanced Provider Foundation (Backend-First)
- [x] add provider capability manifest metadata for known provider options
- [x] extend runtime diagnostics provider options with additive install/availability state
- [x] add backend-owned explicit install action for optional enhanced providers
- [x] add install status tracking with structured started/completed/failed responses
- [x] keep local install state/log/cache ownership in backend-local data paths
- [x] frontend inline install UX in Advanced Runtime Options (install/retry/install&use actions)
- [x] compact install status polling and post-install runtime refresh in provider-selection cards
- [x] compact copy/failure-path polish for optional enhanced provider install states
- [x] replace the practical enhanced drum path with `demucs-drums` using Demucs stem isolation plus lightweight rule-based onset detection
- [x] lightweight provider-used/fallback summary in the result area for clearer Auto behavior
- [ ] deeper frontend polish (expanded install history/log viewing and richer progress detail) if needed later

## Fixed Official Enhanced Set + Controlled Custom Extension Path
- [x] make the fixed official enhanced-provider set explicit in backend manifest metadata
- [x] keep the official enhanced set limited to demucs, basic-pitch, and demucs-drums
- [x] add a backend-local custom-provider registry persisted under app-managed local storage
- [x] add explicit backend request/response models for custom-provider install
- [x] support one narrow first-version custom source type: local `file://` manifest URL
- [x] validate supported custom source input and fail clearly on unsupported sources
- [x] add install job/status tracking for custom provider registration
- [x] surface custom providers distinctly from official enhanced providers in runtime diagnostics
- [x] preserve existing built-in and official enhanced install flows
- [x] minimal frontend follow-up to surface custom-provider registration results in the compact runtime UI without widening scope
- [x] add a compact local `file://...json` custom manifest registration flow in the existing runtime area
- [x] tighten runtime wording so built-in, official enhanced, and custom registered states stay clearly separated

## Deferred Track
- [ ] user accounts and authentication
- [ ] cloud storage and multi-device sync
- [ ] public sharing and permission systems
- [ ] background job recovery after restart
- [ ] richer engraving fidelity and advanced notation semantics


