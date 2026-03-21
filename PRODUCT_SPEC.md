# PRODUCT_SPEC.md

## Product Name
AI Sheet Music Generator

## Vision
Turn uploaded audio into editable draft transcription results inside a local-first browser workspace, with lightweight review before export.

The product remains:
- local-first
- draft-first
- browser UI + local backend
- export-oriented rather than cloud-oriented
- MuseScore-handoff-oriented for final notation polishing

## Current Product Scope
Implemented product scope includes:
- audio upload and job creation
- backend-local normalization of common audio inputs into a stable PCM WAV intermediate
- source separation, piano transcription, and drum transcription
- lightweight score preview, drum notation preview, stem audition, and piano-roll editing
- draft editing with undo / redo and saved latest-draft persistence
- region re-transcription
- heuristic draft analysis suggestions
- separate piano/drum MIDI and MusicXML export
- local project library reopen flows
- project import/export packaging
- local runtime diagnostics
- bilingual user-facing workflow copy in the main workspace

## Workspace Experience
Phase 14.5 defines the main product workspace in this order:
1. Hero and top action area
2. Upload or project entry
3. Main verification preview
4. Editing area
5. Export area
6. Advanced Details

Presentation priorities:
- the browser preview is a lightweight verification surface, not the final notation destination
- drum notation is a secondary verification companion
- the piano roll is a quick-fix editing support surface rather than the dominant result
- short local stem audition should be available when persisted stems exist
- advanced technical details stay available but are collapsed by default
- in the Project Library, opening a project should remain the clearest action while rename/duplicate/delete stay available with less visual weight
- long score and drum results should stay inside stable preview readers with internal scrolling rather than stretching the full page
- advanced runtime provider choices should be discoverable near upload/start, but kept inside a restrained product-style panel rather than a dominant engineering control row
- optional enhanced provider options may expose compact inline install/retry status in that same runtime panel, without turning it into a package-management dashboard
- optional enhanced provider copy should stay honest about local runtime requirements, and `Demucs Drums` should be described as a Demucs-plus-rules enhanced path rather than a guaranteed drum model
- the same compact runtime area may also expose a narrow custom-provider registration flow for local `file://...json` manifest URLs only
- custom-provider registration copy should clearly distinguish built-in, official enhanced, and custom registered states
- generated results should expose a lightweight provider-used/fallback summary so Auto behavior stays understandable without opening developer-style diagnostics
- export and handoff should clearly recommend separate piano/drum files for MuseScore as the final notation polishing environment
- drum MusicXML should use lightweight percussion semantics so MuseScore imports it as a readable drum staff without pretending to be a full notation engine
- the homepage may carry the strongest fantasy/music atmosphere, but imagery must stay controlled and all workflow panels must remain readable and product-like
- the fixed official enhanced-provider set remains limited to demucs, basic-pitch, and demucs-drums
- any future extra provider should come through a controlled custom-provider extension path rather than expanding the built-in official enhanced set

## User Story
As a user, I want to upload audio, get a usable draft transcription, verify it locally with lightweight preview and listening, clean up obvious mistakes, and export it without relying on the cloud.

## Success Criteria
A successful current product:
- completes end-to-end on supported local inputs
- clearly handles missing local dependencies such as `ffmpeg` for compressed-input preprocessing
- clearly emphasizes export-ready transcription output over in-browser engraving
- keeps browser-side editing positioned as review-and-fix before export
- preserves the original result while allowing saved and unsaved draft editing
- exports valid piano-only and drums-only MIDI and MusicXML
- makes MuseScore handoff obvious and honest
- keeps local project workflows honest and understandable
- presents advanced technical detail without cluttering the main path

## UX Constraints
- do not imply publication-grade engraving inside the browser
- do not imply cloud sync or public sharing
- do not imply arbitrary third-party provider execution or universal plugin compatibility
- do not imply that registered custom providers are automatically runnable in the main pipeline
- do not blur `registered` with `installed and execution-ready` in the runtime/provider UI
- keep accessibility, readability, and hierarchy strong even with the manuscript/fantasy visual direction
- keep bilingual copy intentional and consistent rather than partial
- prefer two-line English/Chinese presentation for major section headings, helper copy, and informational cards when it improves readability
- keep shared product terms consistent across home, library, preview, draft, and export surfaces
- keep wording focused on verification before export, lightweight editing, and MuseScore handoff

## Deferred / Not Near-Term
- accounts and authentication
- public sharing and permission systems
- cloud storage and multi-device sync
- background job recovery after restart
- richer in-browser engraving fidelity and advanced notation semantics
- additional instruments beyond the current serious piano/drum focus
