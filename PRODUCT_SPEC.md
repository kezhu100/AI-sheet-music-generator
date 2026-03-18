# PRODUCT_SPEC.md

## Product Name
AI Sheet Music Generator

## Vision
Turn uploaded audio into editable draft sheet music, beginning with piano and drums.

Product direction remains local-first: users run the application locally through a browser UI backed by local services and local filesystem persistence. Desktop packaging may come later, but it is optional and not required for core product viability.

## Core User Story
As a user, I want to upload a song or isolated stem, receive editable draft notation for piano and drums, improve that draft, save my work, and reopen it later.

Current product outputs:
- multi-track note events
- MIDI export
- MusicXML export
- readable piano-roll and notation-oriented previews
- a saved latest draft separate from the original completed result
- a local project-library view for reopening persisted work
- local project import/export packaging for handoff and backup

Current delivery model:
- browser UI + local backend services
- local filesystem-backed project and draft persistence
- local zip-based project packaging
- no accounts, no cloud sync, and no SaaS assumptions

## Primary Use Cases
1. Upload a mixed song and generate piano + drum draft notation.
2. Upload an isolated piano recording and generate piano score.
3. Upload a drum recording and generate drum notation.
4. Correct the generated draft in the browser, save it, and continue from that saved draft later.
5. Re-transcribe a selected piano or drum region instead of rerunning the whole job.
6. Analyze the current draft for heuristic correction suggestions before exporting to external tools.
7. Reopen a completed local project from the project library and continue editing/exporting.
8. Open a local project folder or import a portable project package into the local library as a new local project instance.
9. Export a completed local project to a portable zip package on the local filesystem.
10. Run the product locally as a browser-based local app with a simple startup flow.

## Current Product Scope
The currently implemented local MVP supports:
- audio upload
- job creation and status tracking
- source separation for mixed audio
- piano transcription
- drum hit transcription
- normalized event output
- MIDI export
- MusicXML export
- piano-roll preview plus simplified piano and drum notation previews
- frontend draft editing
- saved latest-draft persistence
- region re-transcription
- AI-assisted draft correction suggestions
- local project-library reopen flow
- project rename / delete / duplicate actions
- local project open/import/export actions
- clearer project metadata plus unsaved draft-state indication in library/workspace surfaces
- locale-ready project/library labels through a small bilingual copy structure

## Success Criteria
A successful local MVP:
- completes end-to-end on at least a subset of supported audio files
- outputs structured normalized note events
- exports valid MIDI and MusicXML drafts
- supports saving and reopening the latest edited draft separately from the original completed result
- shows project/library state honestly in the UI
- clearly labels limitations

## Known Constraints
- mixed-audio transcription quality depends heavily on source separation quality
- generated score is a draft, not guaranteed publication-grade notation
- drum notation may require heuristic mapping
- tempo changes and expressive timing may reduce quantization accuracy
- project-library and project-route behavior is local/deployment-scoped only in Phase 12
- imported project packages always become new local project instances; source bundle identity is traceability metadata only
- Phase 13L `open-local` is intentionally import-into-library rather than open-in-place; this keeps local project identity isolated and library behavior consistent
- project delete currently prioritizes hiding deleted projects from the library/detail routes immediately; local file cleanup is still best-effort in the same filesystem
- the current product does not implement accounts, public sharing, or background job recovery

## Near-Term Product Roadmap (Local-First)
- Phase 14L - Local deployment and one-click startup for the browser UI plus local services, with runtime checks and clearer setup flow
- Phase 15L - Optional desktop application packaging (Electron, Tauri, or equivalent) for OS-level integration later

Roadmap guardrails:
- preserve normalized `JobResult` as the shared contract
- preserve separation between original completed result, saved latest draft, and in-session draft
- keep modular provider-based architecture intact
- keep local-first constraints explicit

## Deferred / Not Near-Term
- user accounts and ownership rules
- public sharing and permission systems
- cloud object storage or hosted multi-device sync
- database-backed SaaS infrastructure
- background job recovery after restart
- additional instruments
- richer quantization, voicing, and notation fidelity
- user-selectable transcription presets
