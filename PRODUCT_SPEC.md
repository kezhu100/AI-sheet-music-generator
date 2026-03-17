# PRODUCT_SPEC.md

## Product Name
AI Sheet Music Generator

## Vision
Turn uploaded audio into editable draft sheet music, beginning with piano and drums.

## Core User Story
As a user, I want to upload a song or isolated stem, receive editable draft notation for piano and drums, improve that draft, save my work, and reopen it later.

Current product outputs:
- multi-track note events
- MIDI export
- MusicXML export
- readable piano-roll and notation-oriented previews
- a saved latest draft separate from the original completed result
- a local project-library view for reopening persisted work

## Primary Use Cases
1. Upload a mixed song and generate piano + drum draft notation.
2. Upload an isolated piano recording and generate piano score.
3. Upload a drum recording and generate drum notation.
4. Correct the generated draft in the browser, save it, and continue from that saved draft later.
5. Re-transcribe a selected piano or drum region instead of rerunning the whole job.
6. Analyze the current draft for heuristic correction suggestions before exporting to external tools.
7. Reopen a completed local project from the project library and continue editing/exporting.

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
- project-library and share-route behavior is local/deployment-scoped only in Phase 12
- the current product does not implement accounts, public sharing, or background job recovery

## Deferred / Future Features
- user accounts and ownership rules
- public sharing and permission systems
- cloud object storage or hosted multi-device sync
- background job recovery after restart
- additional instruments
- richer quantization, voicing, and notation fidelity
- user-selectable transcription presets
