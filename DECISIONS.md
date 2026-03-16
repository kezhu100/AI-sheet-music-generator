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

## Template
### YYYY-MM-DD
Decision:
Context:
Chosen option:
Alternatives considered:
Tradeoffs:
Follow-up:
