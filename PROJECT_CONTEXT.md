# PROJECT_CONTEXT.md

## Project Name
AI Sheet Music Generator

## Executive Summary
AI Sheet Music Generator is a local-first browser application that converts audio into editable draft sheet music for piano and drums.

The current product includes:
- audio upload
- provider-based source separation and transcription
- score-first result review in the browser
- draft editing and saved-draft persistence
- region re-transcription and draft analysis
- MIDI and MusicXML export
- local project reopen, import, and export workflows

## Current Milestone
- Phase 14L is complete for local deployment, one-command startup, and runtime diagnostics
- Phase 14.5 is complete for product polish, workspace hierarchy refinement, bilingual cleanup, and visual direction upgrade

## Phase 14.5 Outcome
Phase 14.5 does not change the backend architecture or persistence model.
It refines presentation and information hierarchy so the product feels like a polished creative tool rather than a debug dashboard.

Phase 14.5 adds:
- a single shared workspace shell for home and project routes
- score-first page hierarchy
- compact supporting piano-roll viewport
- export area separated from editing
- advanced technical details collapsed by default
- restrained manuscript / fantasy / Celtic-inspired product styling
- stronger bilingual UI wording in the main workflow
- cleaner two-line English/Chinese presentation in key library and workspace headings
- a quieter Project Library action hierarchy with direct project entry emphasized over lower-frequency management controls
- fixed-height internal-scroll preview readers for longer score and drum results
- an Advanced Runtime Options panel near upload/start with Auto defaults, explicit provider choices, and disabled unavailable options
- a homepage-led visual alignment pass that translates the fantasy music artwork into controlled hero atmospherics and shared framed product surfaces

## Product Guardrails
These remain unchanged:
- local-first runtime
- browser UI + local backend
- no cloud dependency
- no account system
- original completed result, saved latest draft, and in-session draft stay separate
- `JobResult` remains the core normalized contract
- provider-based backend boundaries remain intact

## Current Frontend Structure
The main workspace is now organized as:
1. Hero and primary action area
2. Upload or project entry
3. Main result preview with score first
4. Editing area
5. Export area
6. Advanced Details (collapsed by default)

Advanced Details contains runtime/provider summaries, stems, warnings, and raw note-detail surfaces that are still useful but should not dominate the main path.

## Known Constraints
- mixed-audio quality still depends heavily on separation quality
- generated notation remains a draft, not final engraving
- score preview remains simplified rather than publication-grade notation
- project workflows remain local-only
- background job recovery is still deferred

## Next Roadmap Direction
- preserve the current local-first product architecture
- continue improving usability without breaking the current contract boundaries
- keep desktop packaging optional in Phase 15L rather than mandatory
