# TASKS.md

## Phase 0 - Repository Bootstrap
- [x] create monorepo structure
- [x] add frontend app
- [x] add backend app
- [x] add shared types package
- [x] add music engine package
- [x] add basic README and developer setup

## Phase 1 - Upload and Job Pipeline
- [x] add audio upload flow
- [x] create job creation API
- [x] create job status API
- [x] store uploaded files locally for development
- [x] display job progress in UI

## Phase 2 - Source Separation
- [x] define separation provider interface
- [x] add first separation backend
- [x] persist generated stems
- [x] display stems in UI
- [x] document supported formats and limitations

## Phase 3 - Piano Transcription
- [x] define piano transcription provider interface
- [x] add first piano provider
- [x] normalize provider output to NoteEvent schema
- [x] preview piano notes in UI
- [x] basic validation on a sample clip

## Phase 4 - Drum Transcription
- [x] define drum transcription provider interface
- [x] add first drum provider
- [x] map drum labels to MIDI notes
- [x] preview drum hits in UI
- [x] basic validation on a sample clip

## Phase 5 - Post Processing
- [x] tempo estimation integration
- [x] quantization helpers
- [x] bar and beat alignment
- [x] track merge logic
- [x] confidence-based filtering

## Phase 5.5 - Post-Processing Consolidation
- [x] extract reusable timing utility functions
- [x] split backend timing math from post-processing orchestration
- [x] expose shared frontend timing helpers in `packages/music-engine`
- [x] reduce ad hoc timing formatting in the result UI
- [x] document the timing helper boundaries for Phase 6 preparation

## Phase 6 - Export
- [x] MIDI export
- [x] MusicXML export
- [x] file download endpoints
- [x] export buttons in UI

## Phase 7 - Score Preview
- [x] piano-roll preview
- [x] score preview for piano
- [x] drum notation preview
- [x] track visibility toggles

## Phase 8 - Editing
- [x] note selection
- [x] drag to move note timing
- [x] adjust pitch
- [x] delete/add notes
- [x] re-export edited score

## Phase 9 - Editing Persistence
- [x] add draft storage for edited `JobResult` data
- [x] add save draft API endpoint(s)
- [x] add load draft API endpoint(s)
- [x] auto-load a saved draft in the frontend when available
- [x] add explicit save draft action in the editor UI
- [x] support continuing edits from an existing saved draft
- [x] distinguish export of original result versus edited draft result
- [x] add minimal draft version tracking
- [x] document saved-draft limitations and lifecycle clearly

## Phase 10 - Editing UX Improvements
- [x] add undo / redo for draft edits
- [x] add multi-note selection
- [x] add box selection in the piano-roll editing surface
- [x] add keyboard editing shortcuts and affordances
- [x] add quantization tools for edited notes
- [x] add drum lane reassignment
- [x] expand tests around richer editing actions and state transitions

## Phase 11 - Result Quality & AI Improvements
- [x] evaluate stronger source separation backends behind the existing provider contract
- [x] evaluate improved piano transcription backends behind the existing provider contract
- [x] evaluate improved drum transcription backends behind the existing provider contract
- [x] improve post-processing without breaking the normalized `JobResult` contract
- [ ] add region re-transcription workflow hooks
- [ ] explore AI-assisted correction helpers on top of the editable draft flow
- [x] document quality expectations and fallback behavior for upgraded providers

## Phase 12 - Productization
- [ ] add a project library view
- [ ] persist saved audio and drafts as user-facing project assets
- [ ] introduce user accounts when storage and ownership rules are defined
- [ ] support shareable score links
- [ ] improve first-run onboarding and guidance
- [ ] document hosted deployment targets and operational assumptions
