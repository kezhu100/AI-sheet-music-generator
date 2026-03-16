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

Phase 11A source separation update:
- the separation stage now selects a backend explicitly through configuration instead of always using the development copy provider
- `development-copy` remains available for local development and deterministic fallback
- `demucs` can be enabled as a stronger backend when Demucs is installed in the configured Python environment
- fallback can automatically return to `development-copy` when the stronger provider is unavailable
- persisted stems remain normalized as `piano_stem` and `drum_stem` so downstream transcription and frontend result handling stay unchanged
- the current Demucs path maps `drum_stem` from `drums.wav` and maps `piano_stem` from a configurable non-drum output, defaulting to `other.wav`
