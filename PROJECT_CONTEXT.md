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

### Phase 2 - Source Separation
Completed.

Implemented features:
- source separation provider interface is part of the backend pipeline contract
- first separation backend added for local development
- per-job stems are persisted on disk
- job results now include normalized stem metadata
- frontend result view surfaces generated stems and warnings

### Phase 3 - Piano Transcription
Completed.

Implemented features:
- first real piano transcription provider added behind the provider abstraction
- provider output is normalized into `NoteEvent`
- backend pipeline now routes the persisted piano stem through the heuristic WAV provider
- frontend result view now surfaces piano notes from the real provider
- basic validation added with a generated PCM WAV sample clip

Current Phase 3 runtime behavior:
- the real piano provider currently supports only uncompressed PCM `.wav` stems
- the provider is heuristic and best suited to simple monophonic or lightly overlapping piano phrases
- the source separation step is still a placeholder file-copy backend, so piano stems are not truly isolated yet
- drum transcription is still mocked

---

# Current Pipeline

Current flow:

upload audio
->
create job
->
persist placeholder stems through the source separation provider
->
run heuristic WAV piano transcription on the persisted piano stem when the stem is an uncompressed PCM `.wav`
->
keep drum transcription mocked
->
return normalized stems + tracks + warnings
->
frontend displays stems + piano notes + track summaries + warnings

The architecture now supports replacing both the local development separation backend and the heuristic piano provider with stronger providers in later phases.

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
- piano_transcription.py

Current providers:
- source separation provider: local development stem persistence backend
- piano transcription provider: heuristic stdlib-only WAV provider
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
- piano note preview display
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

## Phase 4 - Drum Transcription Provider

Goal:
Integrate a real drum transcription provider.

Tasks:
- define drum transcription provider interface
- implement first provider
- map drum outputs to the normalized schema
- integrate provider into pipeline
- return real drum hits instead of mocked notes

Scope limitation:
- do not start export or score rendering work in this phase

---

# Future Phases

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
