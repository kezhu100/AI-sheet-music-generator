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
- [ ] piano-roll preview
- [ ] score preview for piano
- [ ] drum notation preview
- [ ] track visibility toggles

## Phase 8 - Editing
- [ ] note selection
- [ ] drag to move note timing
- [ ] adjust pitch
- [ ] delete/add notes
- [ ] re-export edited score
