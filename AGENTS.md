# AGENTS.md

## Project Overview
This repository contains an AI-powered sheet music generation app.

Primary goal:
- let users upload audio files
- separate instruments from mixed audio
- transcribe piano notes and drum hits
- generate editable multi-track note events
- export MIDI and MusicXML
- render a readable piano score and drum notation preview in the web app

This project should be built incrementally.
Do not attempt a research-grade "perfect transcription for any song" in one pass.
Prefer an MVP that produces editable draft results.

## Product Scope
Target instruments for the first serious version:
- piano
- drums

Future instruments may include:
- bass
- guitar
- vocals melody
- strings

## Engineering Priorities
Order of priority:
1. correctness of data flow
2. stable local development
3. modular architecture
4. usable UI
5. model quality improvements
6. visual polish

## Non-Goals
For early phases, do NOT optimize for:
- full orchestral transcription
- perfect engraving quality
- real-time streaming transcription
- training new foundation models from scratch
- mobile app support

## Recommended Architecture
Use a modular monorepo structure with:
- `apps/web` for the frontend
- `apps/api` for the backend
- `packages/shared-types` for shared schemas and DTOs
- `packages/music-engine` for reusable music processing logic

Suggested stack:
- frontend: Next.js + TypeScript
- backend: Python FastAPI
- task execution: background job worker if needed
- audio processing: Python-based pipeline
- score rendering: a web notation library or a piano-roll-first UI
- export: MIDI first, MusicXML second

## Functional Pipeline
The pipeline should be designed as:

1. upload audio
2. normalize audio format
3. run source separation
4. produce stems
5. route each stem to the best transcription module
6. merge note events into a common event schema
7. quantize and align to beat grid
8. export MIDI and MusicXML
9. render web preview
10. allow manual correction later

## Model Strategy
Prefer a plug-in style architecture for model providers.

Examples:
- source separation provider
- piano transcription provider
- drum transcription provider

Do not hard-code the application to one ML provider.
Make it easy to swap implementations later.

## Data Contract
All transcription modules must output a normalized event schema.

Minimum fields:
- instrument
- pitch
- onset_sec
- offset_sec
- velocity
- confidence
- channel
- bar
- beat
- source_stem

For drums, allow `pitch` to represent drum MIDI mapping or use:
- drum_label
- midi_note

## Coding Rules
- Use TypeScript on the frontend.
- Use Python 3.11+ on the backend unless there is a strong reason otherwise.
- Prefer explicit types over implicit types.
- Avoid large files when possible.
- Keep modules small and composable.
- Do not mix UI logic with music-processing logic.
- Do not hardcode sample assets into production code.
- Write clear comments only where the code is non-obvious.

## API Design Rules
- Keep API contracts versionable.
- Return structured JSON with clear status fields.
- Separate upload endpoints from processing endpoints.
- Processing jobs should be resumable or at least queryable by job id.

## UI Rules
- Build the simplest usable interface first.
- The MVP UI should support:
  - file upload
  - job status
  - waveform or timeline preview
  - track list
  - note preview
  - export buttons

Avoid spending too much time on visual polish before end-to-end flow works.

## File and Folder Hygiene
When creating files:
- place shared types in `packages/shared-types`
- place pure utility code in `packages/music-engine` when reusable
- keep backend service code inside `apps/api`
- keep frontend pages, components, and hooks inside `apps/web`

## Testing Expectations
For any meaningful feature:
- add or update tests where practical
- verify type checks
- verify lint
- verify app starts locally
- verify the changed flow manually if automated tests are incomplete

## Definition of Done
A task is done only if:
- code is implemented
- affected tests pass or are updated
- basic developer instructions remain accurate
- no obviously dead code is introduced
- the feature works in the intended path
- limitations are documented honestly

## Safety and Scope Control
When requirements are ambiguous:
- make the smallest reasonable architectural choice
- prefer extensibility over overengineering
- document assumptions in `DECISIONS.md`

Do not fabricate benchmark claims.
Do not claim model quality that has not been validated in this repository.

## Iteration Strategy
Always work in phases.
Prefer the following order:
1. project scaffold
2. upload and job pipeline
3. source separation integration
4. piano transcription integration
5. drum transcription integration
6. common event schema
7. MIDI export
8. MusicXML export
9. score preview UI
10. editing tools

## Task Execution Style for Codex
When given a feature request:
1. inspect relevant files first
2. explain the intended change briefly
3. implement minimal cohesive changes
4. run the relevant checks
5. summarize what changed, what remains, and any limitations

When the task is large:
- break it into smaller sub-steps
- complete the highest-value step first
- leave clear TODOs instead of half-finished hidden behavior