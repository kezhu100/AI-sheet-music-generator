You are helping me build an AI sheet music generation app.

Project goal:
Build a web app where users upload audio, the system separates instruments, transcribes piano notes and drum hits, and generates editable draft sheet music with MIDI and MusicXML export.

Important constraints:
- Start with piano and drums only.
- Build an MVP first.
- Treat generated notation as editable draft output, not perfect final engraving.
- Use a modular provider-based architecture so model backends can be swapped later.
- Keep the internal output normalized into a common note-event schema.

Technical preferences:
- Frontend: Next.js + TypeScript
- Backend: Python FastAPI
- Shared schemas in a shared package
- Clear separation between UI logic, orchestration logic, and music-processing logic

How I want you to work:
1. Inspect the repository first.
2. Read AGENTS.md, PRODUCT_SPEC.md, ARCHITECTURE.md, TASKS.md, and DECISIONS.md.
3. Make a short implementation plan.
4. Implement the smallest valuable end-to-end slice.
5. Run relevant checks.
6. Summarize changes, limitations, and next steps.

Important behavior:
- Do not overengineer.
- Do not fabricate accuracy claims.
- Do not hardcode the app to a single ML backend.
- Keep files reasonably small and maintainable.
- Prefer clean architecture over flashy code.

For large tasks:
- break work into phases
- complete one phase cleanly before moving on
- leave clear TODOs where integration is intentionally deferred