# DECISIONS.md

## Decision Log

### 2026-03-20
Decision:
- Fill the existing pipeline gap with a small backend-local ffmpeg preprocessing stage instead of redesigning provider boundaries or changing the draft/result architecture.

Context:
- The docs already described an audio normalization stage before source separation and transcription, but the implementation was still passing raw uploads directly into downstream providers.
- The default heuristic piano/drum paths work best on stable PCM WAV input, so compressed consumer formats could appear to complete while producing sparse or empty note data.

Chosen option:
- Add a dedicated backend audio preprocessing service that normalizes job input into a job-scoped PCM WAV intermediate.
- Let already-compatible PCM WAV inputs pass through this stage without requiring ffmpeg transcoding.
- Require a local `ffmpeg` install for compressed or otherwise unsupported inputs and fail fast with actionable error messages when it is missing or when transcoding fails.
- Keep the normalized intermediate backend-owned and local-first, and leave `JobResult`, provider contracts, project persistence, and draft separation unchanged.

Tradeoffs:
- This materially improves local usability for common music files with a small patch-level change, but compressed-input support now depends on `ffmpeg` being present on the local machine.
- The normalized intermediate adds one managed per-job file on disk, but it keeps downstream behavior predictable and avoids silently passing unsuitable input into heuristic providers.

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

### 2026-03-20
Decision:
- Apply a copy-cleanup-only pass across the web UI without changing layout structure, provider controls, or viewport behavior.

Context:
- Key workflow surfaces still had inconsistent terminology, some overly dense helper copy, and a mix of readable bilingual labels and single-line mixed labels.
- A few user-facing Chinese strings in preview surfaces needed cleanup so the product tone stayed intentional and product-oriented.

Chosen option:
- Standardize terms such as Project Library, Score Preview, Piano Score, Drum Companion, Draft, Original Result, Saved Draft, Export, and Advanced Details.
- Prefer two-line English/Chinese presentation in major informational headings and cards where it improves scanability.
- Keep compact controls and dense action rows on single-line bilingual labels when space matters.

Tradeoffs:
- The pass improves clarity without risking layout churn, but some secondary technical surfaces still use compact slash-style bilingual labels for space efficiency.

### 2026-03-20
Decision:
- Refine the Project Library UX with lighter management controls while preserving all meaningful local-project workflows.

Context:
- The library already supported the right capabilities, but each project card exposed too many same-weight buttons at once.
- The result felt noisier than the main workspace and made project entry less visually clear.

Chosen option:
- Keep `Open Project` as the primary visible card action.
- Keep `Open Local Project` and `Import Package` as the main page-entry actions.
- Move lower-frequency per-project management actions behind a lightweight disclosure instead of removing the underlying capabilities.

Tradeoffs:
- Rename, duplicate, and delete now take one extra click, but the page is cleaner and project entry is easier to scan.

### 2026-03-20
Decision:
- Keep the score-first result area visually stable by using fixed-height preview readers with internal scrolling for long score content.

Context:
- Long generated results could make the main result section feel too tall and less product-like.
- The piano score and drum companion were already reader-like surfaces, so containment was better handled at the viewport layer than by changing rendering logic.

Chosen option:
- Preserve the current score and drum rendering logic.
- Give the piano score and drum companion explicit viewport heights with internal scrolling.
- Keep the score section headers and surrounding context outside the scrolling region.

Tradeoffs:
- Users scroll inside the preview readers for long content, which improves page stability but adds one more local scroll area.

### 2026-03-20
Decision:
- Expose provider choice through a restrained Advanced Runtime Options panel near upload/start, backed by additive runtime diagnostics and per-job provider preference overrides.

Context:
- Source separation, piano transcription, and drum transcription providers materially affect result quality, but the main workspace should still feel like a creative tool rather than a runtime dashboard.
- Existing runtime diagnostics already knew the selected provider state, but the upload flow did not expose discoverable provider choice or disabled unavailable options.

Chosen option:
- Keep `Auto` as the default path for all three provider categories.
- Extend runtime diagnostics so each category exposes concrete provider options plus availability.
- Add a collapsed Advanced Runtime Options panel near the upload/start area instead of large top-level engineering dropdowns.
- Pass explicit user selections as additive per-job provider preferences while preserving the current environment-backed defaults for `Auto`.

Tradeoffs:
- The backend contract grows slightly, but only in an additive way that preserves the existing normalized result boundary.
- Provider choice is easier to discover, though some users may still never open the advanced panel unless results look weak.

### 2026-03-20
Decision:
- Use the supplied fantasy music artwork as a homepage visual-language reference, translated into controlled hero atmospherics and shared product-surface styling rather than stretched raw-image backgrounds.

Context:
- The product already had a restrained manuscript/fantasy direction, but the homepage and surrounding product surfaces still felt more generic than the reference artwork.
- The app still needed to behave like a readable creative workspace, so imagery had to stay behind strong panels instead of becoming the UI itself.

Chosen option:
- Give the homepage hero the strongest emerald-gold atmosphere and musical ribbon ornamentation.
- Carry a quieter version of that same family into the Project Library and main workspace heroes.
- Align cards and panels across pages with stronger framed highlights, softer glow accents, and more cohesive surface gradients.

Tradeoffs:
- The result is more distinctive and better aligned across pages, but it intentionally abstracts the artwork into CSS layers and decorative overlays instead of showing a literal full-screen fantasy scene.
