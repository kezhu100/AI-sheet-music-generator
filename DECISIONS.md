# DECISIONS.md

## Decision Log

### 2026-03-16
Decision:
- Implement Phase 11C drum transcription as an explicitly configured provider selection layer that keeps the existing heuristic WAV backend, adds an optional madmom-backed provider, and supports graceful fallback without changing the normalized `JobResult`.

Context:
- Phase 11A and 11B had already made source separation and piano transcription configurable, but drum transcription was still hard-wired to the original heuristic provider.
- The architecture already expected future stronger drum backends behind the `DrumTranscriptionProvider` contract, while post-processing, preview, editing, persistence, and export continued to depend on normalized drum `NoteEvent` output.
- The repository still validates on Python 3.9 locally, while stronger ML tooling is more likely to live in separate Python 3.10+ or 3.11+ environments.

Chosen option:
- Keep the heuristic WAV provider as the default safe path and optional fallback target.
- Add a madmom-backed provider that can run through a configurable Python executable so optional ML dependencies do not need to be installed into the FastAPI runtime itself.
- Use the stronger provider for onset detection while preserving stable drum-lane normalization back to the existing `kick`, `snare`, and `hi-hat` mapping used by the current editor workflow.
- Surface provider selection and fallback through config, warnings, and the existing `TrackResult.provider` field rather than changing the result schema.

Alternatives considered:
- Replacing the heuristic provider outright with a single hard-coded drum ML stack.
- Adding heavy ML dependencies directly to the current API requirements and requiring an immediate runtime migration.
- Expanding the normalized result schema with richer drum-kit metadata during the provider swap.

Tradeoffs:
- The new path is materially stronger than the heuristic fallback and keeps the architecture modular, but the madmom integration is still optional and depends on a separately prepared local runtime.
- Reusing the existing kick/snare/hi-hat mapping keeps editing and export behavior stable, but richer multi-lane drum-kit coverage is deferred.
- Running ML inference in a separate Python executable reduces coupling with the current API environment, but it adds subprocess orchestration and a small runner shim.

Follow-up:
- Start Phase 11D by improving post-processing without collapsing provider responsibilities into the timing layer.
- Revisit richer drum-lane coverage only if later product work can still preserve the normalized editing/export boundary.
- Validate the madmom path on a real prepared ML runtime before making stronger quality claims.

### 2026-03-16
Decision:
- Implement Phase 11B piano transcription as an explicitly configured provider selection layer that keeps the existing heuristic WAV backend, adds an optional Basic Pitch-backed provider, and supports graceful fallback without changing the normalized `JobResult`.

Context:
- Phase 11A had already made source separation configurable, but piano transcription was still hard-wired to the original heuristic provider.
- The architecture already expected future stronger piano backends behind the `PianoTranscriptionProvider` contract, while post-processing, preview, editing, persistence, and export continued to depend on normalized `NoteEvent` output.
- The repository still validates on Python 3.9 locally, while stronger ML tooling is more likely to live in separate Python 3.10+ or 3.11+ environments.

Chosen option:
- Keep the heuristic WAV provider as the default safe path and optional fallback target.
- Add a Basic Pitch-backed provider that can run through a configurable Python executable so optional ML dependencies do not need to be installed into the FastAPI runtime itself.
- Normalize the stronger provider's raw note-event output into the existing `NoteEvent` fields before post-processing.
- Surface provider selection and fallback through config, warnings, and the existing `TrackResult.provider` field rather than changing the result schema.

Alternatives considered:
- Replacing the heuristic provider outright with a single hard-coded ML stack.
- Adding heavy ML dependencies directly to the current API requirements and requiring an immediate runtime migration.
- Expanding `JobResult` or `NoteEvent` with provider-specific piano metadata during the provider swap.

Tradeoffs:
- The new path is materially stronger than the heuristic fallback and keeps the architecture modular, but the Basic Pitch integration is still optional and depends on a separately prepared local runtime.
- Running ML inference in a separate Python executable reduces coupling with the current API environment, but it adds subprocess orchestration and a small runner shim.
- Preserving the normalized result contract keeps downstream flows stable, but richer provider-specific metadata is intentionally deferred.

Follow-up:
- Evaluate stronger drum transcription in Phase 11C without changing the normalized result boundary.
- Revisit piano-specific post-filters only if later Phase 11 work shows they are needed without collapsing post-processing and provider responsibilities.
- Validate the Basic Pitch path on a real prepared ML runtime before making stronger quality claims.

### 2026-03-16
Decision:
- Implement Phase 11A source separation as an explicitly configured provider selection layer that keeps the existing development copy backend, adds an optional Demucs-backed provider, and supports graceful fallback without changing API routes or the normalized `JobResult`.

Context:
- Phase 10 was already complete, but source separation was still hard-wired to a placeholder backend that simply copied the uploaded file into both stems.
- The project docs already expected stronger providers to swap in behind provider interfaces, while downstream piano/drum transcription, preview, editing, draft persistence, and export continued to depend on normalized persisted stems plus normalized `JobResult` output.
- The repository still validates on Python 3.9 locally, while stronger ML tooling is more likely to live in Python 3.11+ environments.

Chosen option:
- Keep the existing source separation provider abstraction and extend it with runtime warnings so provider choice and fallback behavior can be surfaced honestly.
- Add a configurable `demucs` provider that runs `python -m demucs.separate` through a configurable Python executable, allowing the stronger backend to live in a separate environment from the FastAPI runtime.
- Preserve `development-copy` as the default local provider and optional fallback target.
- Keep persisted stems normalized as `piano_stem` and `drum_stem`, mapping the Demucs outputs into the existing downstream contract.

Alternatives considered:
- Replacing the development backend outright with a single hard-coded ML stack.
- Adding heavy ML dependencies directly to the current API requirements and requiring a Python 3.11 migration immediately.
- Expanding `JobResult` with provider-specific separation metadata instead of using existing stem metadata and warnings.

Tradeoffs:
- The new path is materially stronger than the copy backend and keeps the architecture flexible, but the Demucs integration is still optional and depends on a separately prepared local runtime.
- Mapping Demucs `other.wav` into the normalized `piano_stem` keeps downstream contracts stable, but it is not the same as validated piano-only isolation and is documented as such.
- Graceful fallback preserves the rest of the pipeline in constrained environments, but it means some runs will still complete on placeholder stems unless the stronger provider is both configured and available.

Follow-up:
- Evaluate stronger piano and drum transcription providers for later Phase 11 work once better separated stems are available.
- Revisit whether additional configurable separation providers should be added after real-world testing of the Demucs path.
- Consider richer provider diagnostics only if the current warnings plus `StemAsset.provider` field prove insufficient.

### 2026-03-16
Decision:
- Implement Phase 10 editing UX on top of the existing normalized draft `JobResult` by keeping reusable bulk-editing rules in `packages/music-engine` and keeping undo/redo history as session-local frontend state.

Context:
- Phase 9 already persisted the latest saved edited draft separately from the original completed backend result.
- Phase 10 needed undo/redo, multi-selection, box selection, keyboard editing, quantization tools, and drum lane reassignment without collapsing the distinction between original result, saved draft, and in-session editable draft.
- The current architecture already had a strong split between reusable editing helpers in `packages/music-engine` and UI orchestration in `apps/web`.

Chosen option:
- Extend `packages/music-engine/src/editing.ts` with reusable richer editing helpers for multi-note lookup, bulk delete, group timing moves, quantization, piano transposition, and drum lane reassignment.
- Keep undo/redo stacks, selection-state orchestration, and keyboard shortcut handling in `apps/web/app/hooks/useEditableJobResult.ts`.
- Keep piano-roll box selection and drag gestures in `apps/web/app/components/PianoRollPreview.tsx`, with page-level composition still centered in `apps/web/app/page.tsx`.
- Continue exporting only validated normalized `JobResult` payloads for either the original backend result or the current draft override.

Alternatives considered:
- Persisting undo/redo history or editor deltas in backend draft storage during Phase 10.
- Keeping the new multi-selection and bulk-editing logic mostly inside page-level React handlers.
- Introducing a larger DAW-style editor framework for box selection and keyboard control.

Tradeoffs:
- Session-local history keeps the implementation small and coherent with the current draft snapshot model, but undo/redo does not survive refresh or draft reload.
- Centralizing reusable edit rules in `packages/music-engine` improves maintainability and testability, but some UI-specific interaction state still lives in the web app by design.
- The piano-roll editor remains intentionally MVP-scale and practical rather than a full notation workstation.

Follow-up:
- Revisit persistent revision history only if later product phases truly need saved undo stacks or multi-revision project workflows.
- Expand richer notation editing only when it can still preserve the current normalized draft/export boundaries.

### 2026-03-15
Initial project framing:
- Focus on piano and drums first.
- Product output is editable draft notation, not guaranteed final professional engraving.
- Use provider-based interfaces for ML modules.
- Prefer MIDI export before MusicXML perfection.
- Prioritize end-to-end working pipeline over visual polish.

### 2026-03-16
Decision:
- Bootstrap the repo with `npm` workspaces for TypeScript packages and a standalone FastAPI app for the backend.
- Keep Phase 1 job orchestration in-memory while storing uploaded audio files on disk for local development.
- Use mocked source separation and transcription providers behind explicit provider interfaces.

Context:
- The repository started from documentation only and needed a Phase 0/1 implementation quickly.
- The current environment had Node available but no preinstalled monorepo tooling such as `pnpm`.
- Real ML providers are intentionally out of scope for this phase, but future separation and transcription modules need clean extension points.

Chosen option:
- `apps/web` uses Next.js and imports shared DTOs from `packages/shared-types` plus result helpers from `packages/music-engine`.
- `apps/api` exposes `/api/v1/uploads`, `/api/v1/jobs`, and `/api/v1/jobs/{jobId}` with FastAPI and local file persistence.
- Provider-style interfaces live under `apps/api/app/pipeline`, with mock implementations for separation, piano transcription, and drum transcription.

Alternatives considered:
- Scaffolding a single full-stack app without shared packages.
- Hardcoding mock output directly inside API routes.
- Introducing a database or task queue before Phase 2.

Tradeoffs:
- In-memory jobs keep the implementation small and readable, but job state is lost on API restart.
- Shared types are currently TypeScript-first, so Python models are mirrored rather than code-generated.
- Mock providers validate the data flow, not model quality.

Follow-up:
- Replace the in-memory job store with persistent storage before long-running provider integrations.
- Evaluate schema generation so backend and frontend contracts do not drift.
- Add export endpoints after real normalized event output is wired in.

### 2026-03-16
Decision:
- Treat Phase 0 and Phase 1 as the first completed milestone and keep the project on a mock-processing baseline until Phase 2 begins.

Context:
- Phase 0 and Phase 1 are complete.
- The repository now demonstrates the full upload to job to result flow.
- The current processing path uses mock providers instead of heavy ML models.
- The immediate goal is to validate architecture, job orchestration, API boundaries, and UI integration before adding source separation and transcription backends.

Chosen option:
- Keep the current pipeline mocked for now while preserving the provider-oriented backend structure.
- Continue designing the backend around replaceable interfaces for source separation providers, piano transcription providers, and drum transcription providers.
- Document the runtime reality that the current scaffold is running on Python 3.9 for compatibility with the current machine.
- Continue recommending Python 3.11+ in project guidance for future ML integrations.

Alternatives considered:
- Starting Phase 2 immediately with a first real source separation backend.
- Folding mock behavior directly into routes without provider abstractions.
- Requiring Python 3.11+ immediately even though the current machine is still on Python 3.9.

Tradeoffs:
- The mock pipeline is useful for validating system boundaries and contributor workflow, but it does not validate model quality or ML runtime constraints.
- Staying compatible with Python 3.9 helps local progress now, but future ML integrations may need newer Python versions and dependency stacks.
- Preserving provider-oriented abstractions adds a bit of upfront structure, but it reduces future rewrites when real ML modules are introduced.

Follow-up:
- Start Phase 2 by swapping the mock source separation path for a real provider implementation.
- Reassess Python version requirements when the first ML dependencies are introduced.
- Keep the frontend and API contracts stable while replacing mock providers with real implementations.

### 2026-03-16
Decision:
- Implement Phase 2 with a provider-based local development source separation backend that persists stems on disk and returns normalized stem metadata in the job result.

Context:
- Phase 0 and Phase 1 were already complete and the repository already had a working upload to job to result flow.
- The project docs require Phase 2 to cover source separation only, not piano transcription, drum transcription, export, or score editing.
- The backend needed a first replaceable separation backend without collapsing abstractions or hardcoding logic into API routes.
- The repository does not yet include validated ML separation dependencies or a persistent database.

Chosen option:
- Keep the provider-oriented backend pipeline and add a `SourceSeparationProvider` implementation dedicated to local development.
- Persist per-job stem files under `apps/api/data/stems/<job-id>`.
- Return a new normalized `stems` collection in `JobResult` so the frontend can surface stem artifacts without reading backend-specific file layouts directly.
- Preserve mocked piano and drum transcription providers for now, but point them at the persisted stems to keep the existing result flow working.

Alternatives considered:
- Deferring stem persistence and keeping separation fully mocked in-memory.
- Hardcoding stem generation directly inside the job runner or API routes.
- Introducing a real ML separator dependency during Phase 2.
- Adding a database for job and asset persistence at the same time.

Tradeoffs:
- Copying the uploaded audio into placeholder stem files makes the stem lifecycle real for local development, but it does not validate separation quality.
- Extending the shared result schema now keeps frontend/backend alignment strong, but it adds a little surface area before transcription phases begin.
- Avoiding new heavy dependencies keeps setup simple and reproducible, but it means current Phase 2 output is architectural rather than model-quality validation.

Follow-up:
- Replace the local development separation backend with a validated ML separator in a future task without changing API routes.
- Add stem download endpoints or static asset serving when users need direct access to generated files.
- Begin Phase 3 by introducing a real piano transcription provider that consumes the persisted stems.

### 2026-03-16
Decision:
- Implement Phase 3 with a stdlib-only `HeuristicWavPianoTranscriptionProvider` as the first real piano transcription backend.

Context:
- Phase 3 needed a real piano transcription stage without pulling in heavy ML or DSP dependencies.
- The repository runtime on this machine is Python 3.9.13 with FastAPI dependencies declared, but no reliable lightweight scientific audio stack available in the project environment.
- The backend already persisted stems in Phase 2 and already had a provider-based pipeline ready for swapping the mocked piano stage.

Chosen option:
- Keep the existing provider abstraction and add a real heuristic piano provider under `apps/api/app/pipeline/piano_transcription.py`.
- Limit real transcription support in this phase to uncompressed PCM `.wav` stems.
- Use only the Python standard library for WAV decoding, note-region detection, simple pitch estimation, and velocity heuristics.
- Preserve the existing job result schema and surface runtime limitations through `warnings` plus updated docs.

Alternatives considered:
- Adding `basic_pitch` or another heavier ML transcription stack.
- Adding `numpy`/`librosa` or other DSP dependencies for a stronger heuristic approach.
- Keeping piano transcription mocked for another phase.

Tradeoffs:
- The stdlib-only provider keeps setup light and actually runnable in this repository today, but the transcription quality is intentionally limited.
- Restricting support to PCM `.wav` stems is honest and predictable, but it means later work is needed for broader format coverage.
- Returning simplified dominant-note output is safer than pretending to support reliable dense polyphonic transcription.

Follow-up:
- Replace the heuristic provider with a stronger backend when the project is ready to accept additional dependencies.
- Revisit format support after real source separation is in place.
- Start Phase 4 by replacing the mocked drum stage with a real drum transcription provider.

### 2026-03-16
Decision:
- Implement Phase 4 with a stdlib-only `HeuristicWavDrumTranscriptionProvider` and rename `mock_pipeline.py` to `development_pipeline.py`.

Context:
- Phase 4 needed the first real drum transcription stage without collapsing the existing provider-based backend.
- The repository runtime still favors lightweight, runnable implementations over heavier DSP or ML dependencies.
- The previous pipeline module name had become inaccurate after Phase 3 because the same pipeline now mixed real and placeholder stages.

Chosen option:
- Keep the existing `DrumTranscriptionProvider` abstraction and add a real provider under `apps/api/app/pipeline/drum_transcription.py`.
- Limit the first real drum path to uncompressed PCM `.wav` stems and use only the Python standard library for WAV decoding, onset detection, and simple kick/snare/hi-hat classification.
- Preserve the current `JobResult` and `NoteEvent` contract and express limitations through warnings rather than expanding the schema.
- Rename `apps/api/app/pipeline/mock_pipeline.py` to `apps/api/app/pipeline/development_pipeline.py` and update imports, tests, and docs to match the runtime semantics.

Alternatives considered:
- Keeping drum transcription mocked for another phase.
- Adding `numpy`, `librosa`, or a dedicated drum transcription stack for stronger detection.
- Redesigning the pipeline module layout while doing the rename.

Tradeoffs:
- The heuristic provider is honest and runnable in the current repo, but it is intentionally limited and may miss or misclassify dense drum arrangements.
- Reusing the existing result contract keeps the frontend stable, but richer drum metadata is deferred to later phases.
- The rename improves clarity with minimal churn, but the development pipeline still intentionally contains placeholder source separation.

Follow-up:
- Improve onset classification and beat alignment after better source separation or post-processing is available.
- Reassess richer drum label coverage when heavier dependencies become acceptable.
- Start Phase 5 with post-processing work instead of export or notation rendering.

### 2026-03-16
Decision:
- Implement Phase 5 as a lightweight backend post-processing stage inserted after transcription and before final `JobResult` assembly.

Context:
- The repository already had a working upload -> stems -> transcription -> normalized result flow.
- Project docs explicitly scoped Phase 5 to tempo estimation, quantization, beat/bar alignment, track merge logic, and confidence-based filtering.
- The current schema already exposed `JobResult.bpm` plus `NoteEvent.bar` and `NoteEvent.beat`, so Phase 5 could stay backward compatible without a broad contract redesign.

Chosen option:
- Add `apps/api/app/pipeline/post_processing.py` with a lightweight post-processor that merges duplicate track groups, filters low-confidence events, estimates a single project BPM, quantizes events to a simple sixteenth-note grid, and assigns bar/beat values.
- Reuse the existing `JobResult` and `NoteEvent` fields instead of introducing a new tempo map or notation-specific schema.
- Surface fallback behavior and filtering through result warnings rather than hiding limitations.
- Keep frontend changes small by exposing the improved BPM and beat/bar output through the existing result view.

Alternatives considered:
- Delaying Phase 5 until export or notation rendering introduced richer timing requirements.
- Adding heavier DSP or music-theory dependencies for stronger beat tracking.
- Expanding the shared schema immediately with tempo maps, meter data, or dedicated post-processing metadata.

Tradeoffs:
- The lightweight approach is easy to reason about and fits the current MVP, but it assumes a simple 4/4 grid and a single tempo estimate.
- Reusing existing schema fields avoids churn across frontend and backend, but richer timing models are deferred to later phases.
- Filtering low-confidence events before tempo estimation improves stability, but some borderline events may be dropped from sparse results.

Follow-up:
- Reassess tempo-map and meter support when MIDI export or score rendering needs finer timing control.
- Improve beat tracking after source separation quality improves.
- Start Phase 6 with export work rather than adding notation or editing behavior early.

### 2026-03-16
Decision:
- Implement Phase 5.5 as a small consolidation step that extracts reusable timing helpers without changing the Phase 5 result contract.

Context:
- Phase 5 introduced timing logic in both backend post-processing and frontend timing display, but the helper boundaries were still embedded inside specific files.
- Phase 6 export work will need stable timing conversion and quantization helpers, but Phase 5.5 must not jump ahead into actual export functionality.
- The repository already had a natural shared frontend-facing helper location in `packages/music-engine`, while backend orchestration still needed its own small pure timing module.

Chosen option:
- Keep `apps/api/app/pipeline/post_processing.py` as the orchestration entry point.
- Extract backend timing math into `apps/api/app/pipeline/timing.py`.
- Extract frontend-facing timing helpers into `packages/music-engine/src/timing.ts` and re-export them from the package entry point.
- Update the result page to consume shared timing formatting helpers rather than local ad hoc formatting.

Alternatives considered:
- Leaving the Phase 5 timing logic embedded where it was until Phase 6 started.
- Attempting a cross-language shared implementation between Python and TypeScript.
- Expanding shared types or API contracts just to support the consolidation step.

Tradeoffs:
- The consolidation improves maintainability and clarifies future extension points, but it does not remove the current single-tempo and simple-4/4 limitations.
- Backend and frontend still keep separate implementations because the stack is split across Python and TypeScript, but the helper boundaries now align conceptually.
- Avoiding schema changes keeps Phase 5.5 low-risk, but richer timing metadata remains a future concern.

Follow-up:
- Reuse the extracted timing helpers when implementing Phase 6 export transforms.
- Reassess whether tempo-map or meter-aware helpers are needed once MIDI and MusicXML output begins.

### 2026-03-16
Decision:
- Implement the first Phase 6 export path as a stdlib-only, on-demand MIDI exporter driven by the completed `JobResult`.

Context:
- The repository already had post-processed, timing-aligned track data with a single project BPM, quantized event timing, and piano/drum note events.
- The product docs prioritize MIDI before MusicXML, and the current task explicitly asked for the smallest correct export implementation.
- The backend did not yet expose any export endpoint, and adding export data directly into `JobResult` would have unnecessarily expanded the core result contract.

Chosen option:
- Add `apps/api/app/services/midi_export.py` to transform the completed normalized result into a format-1 MIDI file with a tempo track plus one track per exported instrument track.
- Keep export generation on demand through a dedicated jobs endpoint instead of generating files during job completion.
- Use piano notes on a melodic MIDI channel and drum hits on channel 10 semantics (channel index 9 in the MIDI bytes).
- Reuse the existing post-processed BPM and event timing as the source of truth for export.

Alternatives considered:
- Introducing a dedicated MIDI-writing library.
- Persisting MIDI files during job completion instead of generating them at request time.
- Expanding shared schemas so every job result carried export metadata.

Tradeoffs:
- The stdlib-only exporter keeps setup light and predictable, but it intentionally supports only a simple single-tempo MIDI draft.
- On-demand generation avoids extra storage and keeps the result contract stable, but export is recomputed per request.
- Reusing the current normalized result makes the export path easy to reason about, but export fidelity is limited by the current heuristic transcription and post-processing layers.

Follow-up:
- Add MusicXML export as the remaining Phase 6 task.
- Reassess whether any export helpers belong in shared packages once multiple export formats exist.

### 2026-03-16
Decision:
- Complete Phase 6 by adding a stdlib-only, on-demand MusicXML exporter that uses the same post-processed `JobResult` as the MIDI path.

Context:
- Phase 6 already had a working MIDI export service, endpoint, and frontend download action.
- The remaining export work needed to add MusicXML without redesigning the pipeline or introducing notation-rendering scope.
- The existing result already exposed the timing information needed for a minimal structural MusicXML file: constant BPM, quantized event timing, and bar/beat-aligned note data.

Chosen option:
- Add `apps/api/app/services/musicxml_export.py` using `xml.etree.ElementTree`.
- Expose `GET /api/v1/jobs/{jobId}/exports/musicxml` alongside the existing MIDI endpoint.
- Generate a minimal `score-partwise` document with part-list, measures, attributes, tempo marking, pitched piano notes, and unpitched drum notes.
- Reuse the existing frontend export UX by adding a small MusicXML download action next to the MIDI button.

Alternatives considered:
- Deferring MusicXML until score preview work began.
- Introducing a dedicated MusicXML library.
- Expanding the core result schema with export-specific metadata before generating MusicXML.

Tradeoffs:
- The stdlib-only MusicXML exporter keeps setup light and understandable, but it intentionally models only simple structural notation.
- Reusing the post-processed result keeps export deterministic, but the notation fidelity is limited by the current single-tempo, 4/4, quantized pipeline.
- Avoiding notation-layout logic keeps the feature inside Phase 6, but engraving quality and richer notation semantics are deferred to later phases.

Follow-up:
- Start Phase 7 with score preview work that consumes the current normalized/exportable result.
- Reassess whether some export formatting helpers should move into shared modules once preview and notation needs become clearer.

### 2026-03-16
Decision:
- Implement Phase 7 score preview entirely in the frontend by reusing the existing normalized `JobResult` and adding lightweight preview helpers in `packages/music-engine`.

Context:
- The repository already had normalized, post-processed piano and drum note events plus working MIDI and MusicXML export from the same result shape.
- Phase 7 was scoped to preview only: piano-roll preview, piano score preview, drum notation preview, and track visibility toggles.
- A true engraving renderer would have added unnecessary dependency and architecture weight for this phase.

Chosen option:
- Keep the backend and shared result contract unchanged.
- Add `packages/music-engine/src/preview.ts` for reusable frontend preview math such as track-key generation, visible-track filtering, measure grouping, pitch naming, and simplified staff placement.
- Render a piano-roll timeline, a simplified piano grand-staff preview, and a lane/grid drum notation preview inside the web app.
- Limit notation-oriented panes to the first visible piano track, the first visible drum track, and the first 8 bars so the UI remains readable without pretending to offer full engraving quality.

Alternatives considered:
- Adding a full notation-rendering library during Phase 7.
- Expanding `JobResult` with preview-specific layout data from the backend.
- Deferring score preview until a richer engraving pipeline existed.

Tradeoffs:
- The chosen renderer is honest, lightweight, and aligned with the current MVP architecture, but it is not publication-grade notation.
- Reusing the current result contract keeps the pipeline stable, but preview fidelity remains bounded by the existing single-tempo, 4/4, heuristic transcription pipeline.
- Restricting notation-style panes to the first visible instrument track of each type keeps the implementation cohesive, but multi-track notation layout is deferred.

Follow-up:
- Consider a dedicated notation renderer only when preview fidelity or editing needs justify the extra complexity.
- Revisit multi-track score layout and richer percussion notation in later phases if the product direction still calls for it.

### 2026-03-16
Decision:
- Add a root one-command local development workflow with a small Node orchestration script instead of introducing extra monorepo tooling.

Context:
- Local development previously required separate terminals for the Next.js frontend and the FastAPI backend.
- The repository already had `npm` workspaces for the frontend packages, but the backend remained outside workspace script orchestration.
- The current environment and docs are Windows-leaning, and the backend already uses a project-local virtual environment at `apps/api/venv`.

Chosen option:
- Add `npm run dev` at the repository root.
- Implement the workflow in `scripts/dev.mjs`, which starts the frontend workspace and the FastAPI backend together.
- Make the script call the Python interpreter inside `apps/api/venv` directly rather than relying on shell-specific venv activation behavior.
- Add `npm run dev:api` as a small supporting command and document the exact backend prerequisite clearly.

Alternatives considered:
- Adding `concurrently` or a larger task runner dependency.
- Requiring developers to activate the Python venv manually in a separate terminal.
- Moving the backend into an `npm` workspace package just for dev orchestration.

Tradeoffs:
- The Node script keeps the change small and reviewable, but it assumes the backend venv lives at the documented project-local path.
- Directly invoking the venv interpreter avoids shell activation issues, but developers must create the venv in the expected location.
- The solution improves local startup convenience without changing runtime product behavior or repo architecture.

Follow-up:
- Revisit whether backend setup should be further automated if the project later adds more contributors or CI-level environment bootstrap tooling.

### 2026-03-16
Decision:
- Implement Phase 8 as a frontend-first editing draft layered on top of the completed normalized `JobResult`, with export override POST requests instead of backend edit persistence.

Context:
- Phase 7 preview was already complete and the docs explicitly scoped Phase 8 to manual correction without jumping into a larger DAW-style editor.
- The current architecture already centered the frontend around normalized `JobResult` consumption and intentionally kept preview separate from editing.
- Persisting edits in backend job state would have introduced new storage and lifecycle concerns that the current in-memory job model is not ready to support well.

Chosen option:
- Clone the completed backend result into a draft `JobResult` in the web app once a job completes.
- Keep edit normalization logic in `packages/music-engine` so timing and note cleanup remain reusable and explicit.
- Add narrow POST export endpoints that accept an optional `resultOverride`, allowing MIDI and MusicXML generation from the current draft without mutating the original job record.
- Leave GET export endpoints intact so unedited flows continue to behave exactly as before.

Alternatives considered:
- Persisting edited notes back into the backend job store immediately.
- Introducing dedicated edit-session models or saved projects during Phase 8.
- Building client-side MIDI or MusicXML export instead of reusing the backend exporters.

Tradeoffs:
- The chosen path keeps Phase 8 cohesive and low-risk, but edits are currently lost on refresh or when loading a different job.
- Reusing backend exporters preserves format consistency, but it required a small API contract extension for override-based export.
- Deferring persistence avoids larger architectural churn now, but saved editing sessions remain a future concern.

Follow-up:
- Revisit saved draft persistence when the project is ready for longer-lived jobs or user projects.
- Consider richer drum editing only after the current draft workflow proves stable and useful.

### 2026-03-16
Decision:
- Harden the Phase 8 editing architecture with stable draft note ids, centralized editing helpers, normalization-before-export, and stricter backend override validation.

Context:
- The initial Phase 8 MVP worked, but note operations still depended too much on page-local orchestration and the backend override path trusted edited payloads more than was ideal.
- Future phases will build on the editing layer, so the current draft boundary needed to become more explicit and less fragile before adding more features.

Chosen option:
- Attach stable `draftNoteId` values when cloning backend results into the frontend draft and use those ids for selection, drag, delete, and edit flows.
- Move note-editing rules into `packages/music-engine/src/editing.ts` so timing updates, pitch edits, add/delete, drum defaults, and normalization are shared and immutable.
- Normalize edited drafts before export on the frontend.
- Add backend schema validation for edited override notes, tracks, and result structure before running MIDI or MusicXML export.

Alternatives considered:
- Leaving note identity tied to the backend `id` field alone without a draft-layer id.
- Continuing to keep edit rules mostly inside `apps/web/app/page.tsx`.
- Trusting the typed frontend payload without backend-side validation.

Tradeoffs:
- The hardening adds a little more shared helper surface area, but it reduces long-term fragility and keeps editing rules out of React event handlers.
- Backend validation may reject malformed draft payloads that earlier versions would have silently coerced, but that is safer for export stability.
- The system is still intentionally draft-only and non-persistent; this pass improves safety, not persistence.

Follow-up:
- Revisit draft persistence separately from editing-rule hardening.
- Consider moving more editing-specific UI state into smaller hooks only if future phases make the page orchestration meaningfully more complex.

### 2026-03-16
Decision:
- Finish the Phase 8 wrap-up with a lightweight validation-focused pass instead of adding new framework churn.

Context:
- The editing layer and hardening pass were already complete, but local validation still had two weak points: backend tests depended on an undocumented missing `httpx` package, and the shared editing logic had no direct automated coverage.
- The frontend lint path was also not reliably runnable because the repo still lacked a completed ESLint setup.

Chosen option:
- Add `apps/api/requirements-dev.txt` for the minimal backend test-only dependency.
- Add focused `packages/music-engine` tests for the editing helpers using a compiled TypeScript assertion script instead of introducing a new test framework.
- Add root validation scripts that reflect the commands that actually run successfully today.
- Keep lint documented as an honest current limitation instead of adding half-configured ESLint churn during a stabilization pass.

Alternatives considered:
- Folding `httpx` into production backend requirements.
- Adding Jest, Vitest, or another framework just for the shared editing helpers.
- Forcing an ESLint migration during this pass even though the repo currently lacks the necessary config and package setup.

Tradeoffs:
- The validation path is clearer and more reproducible now, but frontend lint still remains an explicit setup gap.
- The simple assertion-based test runner is intentionally minimal, but it keeps the current repo lightweight and works reliably in the current environment.
- Keeping backend test dependencies separate avoids inflating runtime requirements, but contributors need to install one extra requirements file when they want full API test coverage.

Follow-up:
- Complete the ESLint migration when the project is ready to adopt a real lint configuration instead of `next lint`'s deprecated setup flow.
- Expand shared editing coverage as future phases introduce richer editing behavior.

### 2026-03-16
Decision:
- Prioritize editing persistence before editing UX expansion and model-quality upgrades in the documented roadmap.

Context:
- Phase 8 already delivered a usable frontend-first editing draft, but edits are still lost on refresh and API restart.
- The current architecture already separates the original normalized `JobResult`, the editable draft layer, and validated export generation.
- Stronger transcription providers and AI-assisted correction remain important, but those upgrades are less valuable if users cannot save and resume manual corrections.

Chosen option:
- Make Phase 9 focus on saved draft persistence with simple backend draft storage, save/load endpoints, and frontend draft rehydration.
- Schedule richer editing ergonomics in Phase 10 after persistence exists.
- Schedule model-quality and AI-assisted improvements in Phase 11, keeping them behind the existing provider and normalized-result boundaries.
- Treat broader productization as Phase 12 work that builds on saved drafts and longer-lived project state.

Alternatives considered:
- Prioritizing stronger transcription models before saved edits.
- Jumping directly into user accounts and project libraries before the editing workflow is durable.
- Expanding editing UX before users can reliably preserve their work.

Tradeoffs:
- Prioritizing persistence first slows some visible AI-quality work in the short term, but it makes the existing editing workflow trustworthy and worth investing in.
- Keeping model upgrades behind the current pipeline boundaries may constrain some future provider choices, but it protects the frontend, export, and shared schema contracts from churn.
- Deferring productization until after saved drafts keeps scope more controlled, but some application-level features will intentionally wait.

Follow-up:
- Document Phase 9 through Phase 12 consistently across the planning docs.
- Revisit storage architecture once draft persistence requirements are implemented concretely.

### 2026-03-16
Decision:
- Implement Phase 9 draft persistence as a local file-backed latest-snapshot store that keeps saved edited `JobResult` data separate from the original completed backend job result.

Context:
- Phase 8 already had a stable frontend draft-editing workflow and validated export overrides, but edits were lost on refresh.
- The project still uses an in-memory job store and explicitly does not want database, auth, or broader productization scope during Phase 9.
- Export, preview, and editing already center on the normalized `JobResult` shape, so introducing a separate editor-only persistence model would have added unnecessary drift.

Chosen option:
- Add `apps/api/app/services/draft_store.py` backed by `apps/api/data/drafts/<job-id>.json`.
- Persist one latest saved draft snapshot per completed job using the same normalized `JobResult` contract plus minimal metadata: `jobId`, `version`, and `savedAt`.
- Expose `GET /api/v1/jobs/{jobId}/draft` and `PUT /api/v1/jobs/{jobId}/draft`.
- Keep original export endpoints intact for the completed backend result, and continue using validated normalized override payloads for draft export.
- Auto-load the saved draft in the frontend when it exists, while keeping explicit original-versus-draft export actions in the UI.

Alternatives considered:
- Writing edited data back into `job.result`.
- Introducing a database or project library during Phase 9.
- Saving editor deltas instead of the full edited normalized result.

Tradeoffs:
- Saving the full normalized result keeps the architecture simple and aligned across frontend, backend, and export, but each saved draft rewrites the whole edited payload.
- A latest-snapshot model is easy to understand and local-development friendly, but it does not provide delete, branching, or historical revision restore.
- Keeping draft storage outside `JobStore` preserves the distinction between original output and edited draft, but job metadata and draft metadata now live in separate persistence layers.

Follow-up:
- Add richer revision history, delete semantics, or project-level ownership only if later product phases actually need them.
- Revisit whether saved drafts should survive API restart alongside job metadata once the repository moves beyond the current in-memory job store.

## Template
### YYYY-MM-DD
Decision:
Context:
Chosen option:
Alternatives considered:
Tradeoffs:
Follow-up:
