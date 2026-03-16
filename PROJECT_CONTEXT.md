# PROJECT_CONTEXT.md

## Project Name
AI Sheet Music Generator

## Project Goal
Build a web application that converts uploaded audio into editable draft sheet music.

Target output:
- piano notes
- drum hits
- multi-track note events
- MIDI export
- MusicXML export
- sheet music preview

The system is designed to support mixed audio using a modular pipeline:
audio -> instrument separation -> instrument-specific transcription -> normalized note events -> score generation.

---

# Current Project Status

## Completed Phases

### Phase 0 - Repository Bootstrap
Completed.

Implemented:
- monorepo structure
- frontend application scaffold
- backend FastAPI service
- shared type definitions
- music-engine helper package

Structure:

apps/
- web (Next.js frontend)
- api (FastAPI backend)

packages/
- shared-types
- music-engine

---

### Phase 1 - Upload and Job Pipeline
Completed.

Implemented features:
- audio upload endpoint
- job creation API
- job status API
- in-memory job store
- background processing pipeline
- frontend upload interface
- job polling
- result display

---

### Phase 2 - Source Separation
Completed.

Implemented features:
- source separation provider interface is part of the backend pipeline contract
- first separation backend added for local development
- per-job stems are persisted on disk
- job results now include normalized stem metadata
- frontend result view surfaces generated stems and warnings

Current Phase 2 runtime behavior:
- the separation backend writes `piano_stem` and `drum_stem` files into `apps/api/data/stems/<job-id>`
- those stem files are currently placeholder copies of the uploaded source audio
- piano and drum transcription are still mocked and continue to validate the downstream flow

---

# Current Pipeline

Current flow:

upload audio
->
create job
->
persist placeholder stems through the source separation provider
->
generate mocked note events from the persisted stems
->
return result
->
frontend displays stems + tracks + notes + warnings

The architecture now supports replacing the local development separation backend and the mocked transcription providers with real ML models in later phases.

---

# Backend Architecture

Backend stack:
- Python FastAPI
- provider-based pipeline design

Pipeline modules:

pipeline/
- interfaces.py
- mock_pipeline.py
- source_separation.py

Current providers:
- source separation provider: local development stem persistence backend
- piano transcription provider: mocked
- drum transcription provider: mocked

All providers must output normalized schemas shared between frontend and backend.

---

# Frontend Architecture

Frontend stack:
- Next.js
- TypeScript
- React

Current UI supports:
- audio file upload
- job status polling
- stem summary display
- track summary display
- note preview display
- warning display

Future UI features:
- waveform view
- timeline editor
- piano roll
- sheet music rendering
- export controls

---

# Environment

Current tested environment:

Backend
Python 3.9.13

Recommended future environment
Python 3.11+

Reason:
Many modern audio ML libraries prefer Python 3.10+ or 3.11+.

Frontend

Node.js 18+
npm workspaces used for monorepo.

---

# Next Development Phase

## Phase 3 - Piano Transcription Provider

Goal:
Integrate a real piano transcription provider.

Tasks:
- define piano transcription provider interface
- implement first provider
- convert output to `NoteEvent` schema
- integrate provider into pipeline
- return real piano notes instead of mocked notes

Scope limitation:
- no drum transcription yet
- do not replace later-phase export or score features in this phase

---

# Future Phases

Phase 4
Drum transcription provider.

Phase 5
MIDI export.

Phase 6
MusicXML export.

Phase 7
Score rendering UI.

---

# Design Principles

1. Modular provider architecture
2. Shared normalized event schema
3. Replaceable ML backends
4. Build MVP before optimization
5. AI-generated results are editable drafts, not guaranteed perfect notation

---

# Instructions for AI Coding Agents

Before implementing features:

1. Read
   - AGENTS.md
   - ARCHITECTURE.md
   - TASKS.md
   - DECISIONS.md
   - PROJECT_CONTEXT.md

2. Confirm current phase and correct any stale phase references in older docs.

3. Implement only the next planned phase.

4. Do not introduce large architectural changes without documenting them in DECISIONS.md.
