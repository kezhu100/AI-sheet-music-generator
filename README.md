# AI Sheet Music Generator

A local-first browser tool for turning audio into editable draft sheet music.

## Product Positioning
- Local-first: runs on your machine with local filesystem storage
- Browser UI + local backend: no cloud dependency, no upload-to-SaaS flow
- Draft-first: generated notation is editable and savable without overwriting the original result
- Score-first workspace: the main UI now emphasizes score preview first, then editing and export
- Bilingual product UI: key user-facing workflow copy is presented in English and Chinese

## Phase Status
Current shipped product status:
- Phase 14L completed: local deployment, one-command startup, runtime diagnostics
- Phase 14.5 completed: workspace product polish, score-first layout, restrained manuscript/fantasy visual direction, bilingual cleanup, advanced details collapse

## Core Capabilities
- Upload audio and create a local transcription job
- Generate piano and drum draft notation
- Review a piano score preview, drum notation companion, and piano-roll editor
- Edit note timing, pitch, drum lanes, and added notes in the browser
- Save the latest draft separately from the original completed result
- Analyze the draft for correction suggestions
- Re-transcribe selected regions without rerunning the entire job
- Export MIDI and MusicXML from either the original result or the current draft
- Reopen work from a local project library
- Import or export local project packages

## Workspace Structure
The main workspace is organized as:
1. Hero and primary action area
2. Upload or project entry
3. Main result preview with score first
4. Editing area
5. Export area
6. Advanced Details (collapsed by default)

Advanced Details includes runtime diagnostics, track/provider summaries, generated stems, warnings, and note detail lists so the main workflow stays focused.

## Visual Direction
Phase 14.5 introduces a restrained visual language inspired by manuscript, Celtic, fantasy, medieval, and RPG aesthetics while keeping the app product-like and readable.

Implemented through:
- parchment-toned panels and backgrounds
- bronze / forest / teal accents
- framed cards and ornamental borders
- stronger heading hierarchy
- compact piano-roll viewport so the score remains visually primary

## Local-First Architecture
- Frontend: Next.js
- Backend: FastAPI
- Storage: local filesystem
- Shared contract: `JobResult`
- Editing model: original completed result, saved latest draft, and in-session draft remain separate artifacts

## Quick Start
```bash
npm install
npm run app
```

Then open the local URL printed by the app startup flow.

## Developer Notes
Recommended validation path:
```bash
npm run validate
```

In this repository environment, frontend typecheck and music-engine tests pass. API tests still require the backend test dependency `httpx` in the local Python environment.

## UI Improvements (Phase 14.5+)
- Added main-workspace project ZIP export entry for local package export
- Split piano and drum piano-roll previews into separate panels
- Refined the piano preview with a compact scrollable paper-like viewport
- Extended the restrained fantasy / Celtic UI polish across cards, buttons, and backgrounds

## Constraints
- No cloud sync
- No public sharing system
- No accounts/auth
- No background job recovery after restart
- Output is a draft, not publication-grade engraving

## Roadmap
- Phase 15L: optional desktop packaging (Electron / Tauri or similar)
- Deferred: accounts, cloud storage, public sharing, multi-device sync, background job recovery
