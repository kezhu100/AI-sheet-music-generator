audio
 ↓
separation
 ↓
transcription
 ↓
post_processing
 ↓
tracks
 ↓
(export phase6)
 ↓
notation phase7

Phase 8 editing update:
- after `tracks`, the frontend now clones a draft result for manual note correction before export
- the draft clone assigns stable `draftNoteId` values for note selection and editing actions
- the draft passes through a normalization layer before export
- MIDI and MusicXML export can consume either the original completed result or the current edited draft override
- backend export override payloads are validated before the exporters run
