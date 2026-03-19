# DECISIONS.md

## Decision Log

### 2026-03-19
Decision:
- Treat Phase 14.5 as a product polish and workspace refinement pass on top of completed Phase 14L.

Context:
- The core local-first architecture, provider boundaries, draft model, export model, and project system were already in place.
- The existing workspace still exposed too much debug and pipeline detail at once, making the product feel more like an engineering dashboard than a creative tool.
- The score preview was not visually primary enough, the piano roll was too dominant, and bilingual copy was inconsistent.

Chosen option:
- Keep all backend contracts and persistence rules unchanged.
- Rebuild the frontend workspace around a single shared layout shell for home and project routes.
- Reorder the page into hero, entry, result preview, editing, export, and advanced details.
- Make the score preview the primary result surface and keep the piano roll as a compact supporting editor.
- Move runtime details, provider summaries, stems, warnings, and raw note-detail views into a collapsed advanced disclosure.
- Add a restrained manuscript / fantasy / Celtic visual system through CSS and existing rendering surfaces only.
- Clean up garbled Chinese and expand bilingual user-facing wording in the main path.

Alternatives considered:
- Leaving the current debug/dashboard-style layout mostly intact and only polishing colors.
- Performing a larger frontend subsystem rewrite or backend contract redesign.
- Hiding technical information entirely instead of demoting it into an advanced disclosure.

Tradeoffs:
- The chosen path keeps architecture stable and reviewable, but some older secondary screens may still need future bilingual polish.
- Moving technical detail into a disclosure reduces clutter, but power users need one extra click to inspect runtime/stem/provider information.
- The manuscript visual direction improves distinctiveness, but it intentionally avoids heavy fantasy art so the app remains readable and tool-like.

Follow-up:
- Keep future polish work aligned with the current score-first hierarchy.
- Continue improving bilingual coverage in secondary routes where needed.
- Do not let future product polish undermine the current contract and persistence guardrails.
