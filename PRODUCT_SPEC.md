# PRODUCT_SPEC.md

## Product Name
AI Sheet Music Generator

## Vision
Turn uploaded audio into editable draft sheet music inside a local-first browser workspace.

The product remains:
- local-first
- draft-first
- browser UI + local backend
- export-oriented rather than cloud-oriented

## Current Product Scope
Implemented product scope includes:
- audio upload and job creation
- source separation, piano transcription, and drum transcription
- score preview, drum notation preview, and piano-roll editing
- draft editing with undo / redo and saved latest-draft persistence
- region re-transcription
- heuristic draft analysis suggestions
- MIDI and MusicXML export
- local project library reopen flows
- project import/export packaging
- local runtime diagnostics
- bilingual user-facing workflow copy in the main workspace

## Workspace Experience
Phase 14.5 defines the main product workspace in this order:
1. Hero and top action area
2. Upload or project entry
3. Main result preview
4. Editing area
5. Export area
6. Advanced Details

Presentation priorities:
- the score preview is the primary result
- drum notation is a secondary companion
- the piano roll is an editing support surface rather than the dominant result
- advanced technical details stay available but are collapsed by default
- in the Project Library, opening a project should remain the clearest action while rename/duplicate/delete stay available with less visual weight
- long score and drum results should stay inside stable preview readers with internal scrolling rather than stretching the full page
- advanced runtime provider choices should be discoverable near upload/start, but kept inside a restrained product-style panel rather than a dominant engineering control row
- the homepage may carry the strongest fantasy/music atmosphere, but imagery must stay controlled and all workflow panels must remain readable and product-like

## User Story
As a user, I want to upload audio, get a readable draft score, refine it locally, save my work, and export it without relying on the cloud.

## Success Criteria
A successful current product:
- completes end-to-end on supported local inputs
- clearly emphasizes the generated score as the main outcome
- preserves the original result while allowing saved and unsaved draft editing
- exports valid MIDI and MusicXML
- keeps local project workflows honest and understandable
- presents advanced technical detail without cluttering the main path

## UX Constraints
- do not imply publication-grade engraving
- do not imply cloud sync or public sharing
- keep accessibility, readability, and hierarchy strong even with the manuscript/fantasy visual direction
- keep bilingual copy intentional and consistent rather than partial
- prefer two-line English/Chinese presentation for major section headings, helper copy, and informational cards when it improves readability
- keep shared product terms consistent across home, library, preview, draft, and export surfaces

## Deferred / Not Near-Term
- accounts and authentication
- public sharing and permission systems
- cloud storage and multi-device sync
- background job recovery after restart
- richer engraving fidelity and advanced notation semantics
- additional instruments beyond the current serious piano/drum focus
