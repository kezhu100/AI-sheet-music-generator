# DECISIONS.md

## Decision Log

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

## Template
### YYYY-MM-DD
Decision:
Context:
Chosen option:
Alternatives considered:
Tradeoffs:
Follow-up:
