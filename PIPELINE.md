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

Phase 9 persistence update:
- a local persistence layer now sits between editing and export so edited drafts can be saved and later reloaded
- the original completed result remains the backend source artifact, while the saved draft stores user edits as a separate edited `JobResult`
- each save replaces the previous saved draft for that job and increments a minimal version number
- the frontend auto-loads the saved draft when present and still keeps original-result export separate from draft export
- export continues to support both the original result and the latest saved or in-memory edited draft

Phase 10 editing UX update:
- the editable draft now supports session-local undo/redo without changing backend storage or the original completed result
- selection can now span multiple notes through additive click selection, event-list selection, or piano-roll box selection
- richer editing actions such as keyboard nudging, quantization, bulk delete, and drum lane reassignment still operate on the same normalized draft result shape
- export flow remains unchanged: original export uses the completed backend result, while draft export uses the current validated normalized draft payload
