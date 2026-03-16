# PRODUCT_SPEC.md

## Product Name
AI Sheet Music Generator

## Vision
Turn uploaded audio into editable draft sheet music, beginning with piano and drums.

## Core User Story
As a user, I want to upload a song or isolated stem, detect piano notes and drum hits, and receive:
- multi-track note events
- MIDI export
- MusicXML export
- a readable score preview

## Primary Use Cases
1. Upload a mixed song and generate piano + drum draft notation.
2. Upload an isolated piano recording and generate piano score.
3. Upload a drum recording and generate drum notation.
4. Export machine-generated draft to MIDI or MusicXML for editing in external notation software.

## MVP Scope
The MVP must support:
- audio upload
- job creation and status tracking
- source separation for mixed audio
- piano transcription
- drum hit transcription
- normalized event output
- MIDI export
- simple score or piano-roll preview

## Success Criteria
A successful MVP:
- completes end-to-end on at least a subset of supported audio files
- outputs structured note events
- exports a valid MIDI file
- shows separated track results in the UI
- clearly labels limitations

## Known Constraints
- mixed-audio transcription quality depends heavily on source separation quality
- generated score is a draft, not guaranteed publication-grade notation
- drum notation may require heuristic mapping
- tempo changes and expressive timing may reduce quantization accuracy

## Future Features
- editable note correction UI
- additional instruments
- multiple separation backends
- better quantization and voicing
- user-selectable transcription presets
- cloud processing