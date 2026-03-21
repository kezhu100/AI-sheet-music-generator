audio upload
 upload -> job creation -> source separation -> transcription -> post-processing -> JobResult

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

Phase 11B piano transcription update:
- the transcription stage now selects the piano backend explicitly through configuration instead of always using the heuristic WAV provider
- `heuristic` remains available for local development and deterministic fallback
- `basic-pitch` is the canonical stronger piano backend when Basic Pitch is installed in the configured Python environment
- the legacy piano alias `ml` is still accepted as a backward-compatibility config value and resolves to `basic-pitch`
- fallback can automatically return to `heuristic` when the stronger provider is unavailable
- normalized piano note events still flow into the same post-processing stage and the same `JobResult` structure

Phase 11C drum transcription update:
- the transcription stage now selects the drum backend explicitly through configuration instead of always using the heuristic WAV provider
- `heuristic` remains available for local development and deterministic fallback
- `demucs-drums` is the practical enhanced drum backend, reusing Demucs drum-stem isolation plus deterministic onset rules when Demucs is installed in the configured Python environment
- the legacy drum aliases `ml` and `madmom` are still accepted as backward-compatibility config values and resolve to `demucs-drums`
- fallback can automatically return to `heuristic` when the stronger provider is unavailable
- normalized drum note events still flow into the same post-processing stage and the same `JobResult` structure
- the stronger drum path keeps output mapped to the stable `kick`, `snare`, and `hi-hat` lanes expected by the current editor workflow

Phase 11D post-processing update:
- the post-processing stage remains backend-owned and still returns the same normalized `JobResult` shape
- post-processing now performs richer cleanup before final delivery: confidence-aware filtering, short weak-note removal, near-duplicate cleanup, and overlapping same-pitch piano-note trimming where quantization would otherwise leave stacked durations
- tempo estimation now uses weighted onset evidence from cleaned note events instead of only a minimal adjacent-interval heuristic
- quantization still assumes a simple single-tempo 4/4 result, but it now adaptively chooses between eighth-note and sixteenth-note grids for more predictable normalization
- warnings now surface fallback or cleanup behavior more explicitly when timing evidence is sparse/noisy or when events are removed during normalization

Phase 11E region re-transcription update:
- after the main completed result exists, the editor can now request a piano-only or drum-only time region to be re-transcribed without rerunning source separation or recomputing the whole job
- the backend reuses the persisted target stem, routes only the selected segment through the configured instrument provider, then reuses the existing post-processing stage before returning normalized region notes
- the returned payload is region-note-only, not a partial `JobResult`, and now includes `providerUsed` so fallback-backed retranscription can be surfaced explicitly
- the frontend applies the returned notes only to the current draft for the same instrument and time span, keeping undo/redo, draft persistence, and export behavior on the existing normalized draft workflow

Phase 11F AI-assisted correction update:
- after region re-transcription and other manual edits, the editor can now analyze the current editable draft without rerunning source separation, transcription, or export
- the backend accepts the current draft `JobResult`, inspects normalized note events with conservative heuristics, and returns suggestion objects only
- suggestion types currently include pitch, timing, velocity, and conservative drum-pattern anomalies, while same-pitch overlap cleanup is surfaced through `timing` suggestions to keep the contract small
- the frontend highlights notes with suggestions and lets the user apply a suggestion as one undoable draft edit through the existing editing helpers
- the draft remains the single editable state, saved drafts still store only edited `JobResult` data, and the normalized `JobResult` schema remains unchanged

Phase 11G local audio normalization update:
- the documented normalization stage now performs real backend-local preprocessing instead of acting as a placeholder stage label only
- the backend converts common input formats such as `.mp3`, `.m4a`, `.aac`, and `.flac` into a job-scoped PCM WAV intermediate before source separation and transcription
- compatible PCM WAV uploads still work and are copied into the same normalized handoff location without unnecessary transcoding
- preprocessing fails fast and clearly when `ffmpeg` is missing, the input is corrupt, or ffmpeg itself fails; downstream stages do not continue after normalization failure
- the normalized intermediate stays backend-owned and job-scoped, preserving the existing local-first boundary and the stable `JobResult` contract

Phase 11H upload streaming reliability update:
- upload persistence no longer buffers the entire source file in memory before writing it to disk
- the backend now streams upload chunks directly into the existing local uploads directory
- a configurable server-side max upload size is enforced during streaming, and oversized uploads fail with a clear 413-style API error after partial-file cleanup

Phase 12 productization update:
- job creation now also creates a filesystem-backed project manifest so the local project library can outlive API process memory
- job progress, completion, failure, and draft-save events now update that project manifest rather than depending on the in-memory `job_store` for persisted project listing/detail
- completed jobs now write an immutable `original-result.json` once under `apps/api/data/projects/<project-id>/`
- saved drafts remain in the existing draft store and are surfaced in the project manifest as a separate latest-snapshot asset
- the frontend now includes `/projects` for the local library and `/projects/{projectId}` for reopening persisted project state
- the project route opens the editor workflow only when `originalResult` exists; incomplete or failed projects intentionally render metadata/status only
- current shareable links are stable local route patterns only and do not implement public publishing, permissions, or background job recovery

Phase 12 summary:
- project manifests are now the persisted source of truth for the local library
- immutable completed originals and separate saved drafts preserve the existing original-result versus draft boundary
- project reopen behavior is persisted, but live background execution is still not restart-resilient

Phase 12.5 project-management update:
- rename now changes manifest-backed project labels without mutating the immutable persisted original result
- duplicate now creates a new local project/job identity, copies the persisted original result plus latest saved draft when present, and namespaces duplicated draft note ids
- delete now removes projects from the library/detail routes immediately while local file cleanup remains best-effort in the same filesystem
- persisted completed projects can now fall back to filesystem-backed project data for draft save/load, export, analysis, and region re-transcription flows when the in-memory job record is gone
- persisted per-project provider preferences are reused on reopen and region re-transcription when recorded; older projects without that history fall back conservatively

Phase 13L local project system update:
- the live local project stays manifest-backed and lightweight under `apps/api/data/projects/<project-id>/`
- open-local imports a valid external project folder into the current managed library unless the selected path already points at an existing managed project
- export aggregates `manifest.json`, immutable `original-result.json`, separate `saved-draft.json` when present, and available local upload/stem assets into a zip package written to a caller-supplied local path
- import restores that package into the managed local library as a new independent local project instance with a fresh local `projectId`
- imported original-result and saved-draft artifacts remain separate, and imported draft note ids are re-namespaced to the new local project id
- imported and duplicated original completed results remain semantically clean; draft-only note ids stay on the draft side
- missing optional packaged assets are surfaced honestly; Phase 13L still does not recover in-progress background job execution

Provider foundation update:
- the main transcription pipeline remains unchanged: upload -> normalization -> separation -> transcription -> post-processing -> normalized `JobResult`
- built-in base providers remain the default out-of-the-box execution path
- the fixed official enhanced-provider set remains limited to demucs, basic-pitch, and demucs-drums
- official enhanced providers still use the existing explicit backend install flow
- custom providers now have a separate backend registration path based on a validated local `file://` manifest URL plus app-managed local asset storage
- in this step, custom providers are surfaced in runtime diagnostics only; they are not yet wired into the main provider-selection execution path or `Auto` pipeline behavior
