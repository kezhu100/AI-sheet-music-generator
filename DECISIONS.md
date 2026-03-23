# DECISIONS.md

## Decision Log

### 2026-03-23
Decision:
- Split piano cleanup controls into explicit pre-processing and post-processing sections, and make piano post-processing a two-layer control model with simple presets plus advanced overrides.

Context:
- The existing piano post-processing heuristics could remove too many notes, while the UI already had a separate piano stem pre-filter before transcription.
- Product direction still requires local-first processing, lightweight browser verification, and MuseScore as the deep-edit path, so the fix needed to improve control without expanding browser-side editing complexity.

Chosen option:
- Keep piano stem filtering as a pre-transcription stage and label it clearly as such in the UI.
- Add a dedicated piano post-processing settings block under `ProcessingPreferences`.
- Expose only post-processing on/off and Low / Medium / High cleanup presets in the main visible layer.
- Put advanced post-processing thresholds behind an advanced details area.
- Let preset selection restore a known backend parameter bundle, and let advanced edits switch the profile to `custom`.
- Keep the normalized `JobResult` contract unchanged and preserve backward compatibility by defaulting missing persisted fields.

Tradeoffs:
- This adds a modest amount of settings and persistence complexity, but it keeps the user-facing path understandable and makes piano cleanup less destructive.
- The browser still stops at verification and quick fixes; deeper score cleanup remains a MuseScore handoff task.

### 2026-03-21
Decision:
- Add a lightweight, configurable piano stem pre-filter stage before piano transcription, and make the filtered stem the default piano preview in the workspace.

Context:
- Conservative post-processing cleanup already reduced some residual-driven piano false positives, but users still could not hear or tune cleanup earlier in the audio path.
- Product direction remains local-first, export-first, and MuseScore-centered, so practical controllable cleanup matters more than adding a heavier model or redesigning the browser notation surface.

Chosen option:
- Keep the current provider/export architecture and add a deterministic DSP-style piano pre-filter between source separation and piano transcription.
- Persist project-local piano filter settings, regenerate a filtered piano stem on rerun, and expose both filtered and raw piano stem audition in the existing compact workspace.
- Keep controls small and plain-language: enable/disable, low cleanup, high cleanup, and cleanup strength.

Tradeoffs:
- This improves user control and lets people hear the cleanup effect directly, but it is still not a perfect piano-isolation system and may trade away some piano brightness or low-end body when pushed too far.

### 2026-03-21
Decision:
- Add a conservative piano post-processing cleanup layer to suppress obvious false positives from non-piano residuals left in the separated piano stem.

Context:
- The export path is already the product center of gravity, so cleaner piano drafts matter more than preserving every weak detection.
- The current piano pipeline already has lightweight provider-level thresholds and generic post-processing, but it lacked piano-specific residual filtering after source separation.

Chosen option:
- Keep the current provider architecture and `JobResult` contract unchanged.
- Add a small piano-specific heuristic cleanup stage inside backend post-processing.
- Prefer removing isolated weak/extreme/suspicious piano notes over keeping noisy drafts.
- Avoid introducing a heavier transcription model in this step.

Tradeoffs:
- This should reduce obvious residual-driven noise, but some weak real piano notes may now be filtered more aggressively in exchange for cleaner draft/export output.

### 2026-03-21
Decision:
- Keep export UX compact, but make file purpose explicit so users can immediately distinguish MuseScore handoff, MIDI/DAW export, and compatibility-oriented combined export.

Context:
- Separate piano/drum exports already existed, but the export area still made users infer which file fit which next step.
- Product direction is export-first and MuseScore-centered, so file-purpose guidance matters more than adding more controls.

Chosen option:
- Keep the current export layout and backend contract.
- Add concise export helper copy and success messaging in the existing export area.
- Recommend separate MusicXML for MuseScore, separate MIDI for DAW workflows, and describe combined export as optional compatibility behavior.

Tradeoffs:
- This keeps the patch small and product-aligned, but combined export remains de-emphasized rather than promoted through new top-level UI.

### 2026-03-21
Decision:
- Keep the normalized `JobResult` contract unchanged and add exporter-side grouping so piano and drums are exported as separate MIDI and MusicXML files for MuseScore handoff.

Context:
- The current result model already separates piano and drum tracks, but the main export flow still emitted one combined notation file by default.
- Real MuseScore import feedback showed that the combined handoff path was too messy for the current piano/drum target workflow.

Chosen option:
- Preserve the combined export implementation as a compatible backend capability.
- Add a small export-scope layer that filters the normalized result into piano-only or drums-only content at export time.
- Expose separate piano/drum MIDI and MusicXML downloads in the current export UI instead of redesigning the workspace.
- Recommend separate MusicXML handoff to MuseScore in product copy and docs.

Tradeoffs:
- This keeps code churn low and stays aligned with the current export-first architecture, but it does not attempt a richer multi-part score engraving system inside the browser or exporter.

### 2026-03-21
Decision:
- Clarify the roadmap around lightweight verification before export and MuseScore as the final notation-editing environment.

Context:
- Real usage feedback showed that the preview UI was not the primary place users validated transcription quality.
- Full notation editing in the browser is out of scope, while professional notation tools already handle final editing better.

Chosen option:
- Keep the existing preview and draft surfaces, but describe them as verification and quick-fix tools before export.
- Focus roadmap value on transcription reliability, preview clarity, export usability, and MusicXML handoff.

Tradeoffs:
- The browser remains useful for checking and quick fixes, but intentionally stops short of becoming a full notation editor.

### 2026-03-21
Decision:
- Reposition the product around local-first transcription, lightweight verification/cleanup, and export handoff to MuseScore instead of making in-browser score rendering the centerpiece.

Context:
- The existing architecture, draft model, export boundary, and normalized `JobResult` contract already support a strong local transcription workflow.
- Product direction changed away from investing in richer browser engraving, but users still need enough preview/editing to verify results before export.

Chosen option:
- Keep the existing lightweight score, drum, and piano-roll surfaces, but reframe them as verification and cleanup tools.
- Add compact stem audition using existing persisted local stems and a minimal backend read endpoint rather than changing the result contract.
- Add a clear `Open in MuseScore` handoff action that downloads MusicXML and explicitly tells users to finish notation polishing in MuseScore.
- Do not add OS-level launching behavior or expand `JobResult` for this step.

Tradeoffs:
- The browser keeps useful preview/editing coverage without pretending to be a full notation editor.
- Stem audition currently exposes the persisted full stem rather than a trimmed 15-20 second snippet, which keeps the patch small and honest.

### 2026-03-21
Decision:
- Replace `madmom` as the practical official enhanced drum path with `demucs-drums`, which reuses Demucs stem isolation plus deterministic rule-based onset detection.

Context:
- Keep the official enhanced-provider layering intact while making the enhanced drum path more installable and maintainable inside the existing local-first backend.
- Product scope still requires explicit backend-owned install logic and compact UI wording without turning provider installs into a generic package manager.

Chosen option:
- Keep the built-in heuristic drum provider as the stable fallback and do not change `Auto`, `JobResult`, or the main pipeline shape.
- Reuse the existing Demucs integration rather than adding a separate heavy drum dependency.
- Keep install logs and structured install status intact.
- Surface concise metadata and UI copy that makes `Demucs Drums` the enhanced path and the built-in heuristic drum provider the stable fallback.

Tradeoffs:
- Keep the rule-based onset detector intentionally lightweight and deterministic; it improves maintainability, not guaranteed full drum notation accuracy.

### 2026-03-20
Decision:
- Surface custom-provider registration inside the existing Advanced Runtime Options area instead of creating a separate provider-management screen.

Context:
- The backend now exposes a narrow custom-provider registration path, but product constraints still require the runtime/provider UX to stay compact and non-dashboard-like.
- Custom providers are not execution-ready in this phase, so the UI needed to emphasize registration and diagnostics rather than selection semantics.

Chosen option:
- Add a small "Add custom provider" flow directly in the existing runtime options panel.
- Keep source type fixed to the backend-supported manifest URL path.
- Accept only a local `file://...json` manifest URL in the UI copy and input flow.
- Reuse the existing install-status polling path and refresh runtime diagnostics after completion.
- Render registered custom providers in a distinct compact section, clearly separate from the fixed official enhanced options.

Tradeoffs:
- This keeps the product surface focused and architecture-aligned, but detailed management features such as edit/remove/log browsing remain deferred.
- The runtime copy must stay explicit that custom registration is diagnostic-only and does not make a provider execution-ready.

### 2026-03-20
Decision:
- Fix the official enhanced-provider set to demucs, basic-pitch, and demucs-drums, and route future extra providers through a controlled custom manifest registration path instead of adding more built-in official enhanced providers.

Context:
- The backend already supported optional enhanced provider installs for the current official set, but there was no explicit architectural distinction between "official enhanced" and future third-party/custom extensions.
- Product scope required preserving `Auto`, preserving the current compact runtime UX direction, and avoiding a generic arbitrary-code execution installer.

Chosen option:
- Mark built-in base providers, official enhanced providers, and custom providers distinctly in runtime/provider metadata.
- Keep the official enhanced set fixed and explicit: demucs, basic-pitch, demucs-drums.
- Add a backend-owned custom-provider registry stored under local app data.
- Add a separate custom install request path that currently accepts only a local `file://` manifest URL, validates manifest structure and declared local assets, and copies those files into app-managed storage.
- Surface registered custom providers distinctly in runtime diagnostics without wiring them into the main Auto pipeline in this step.

Tradeoffs:
- This keeps the backend safe and reviewable, but it intentionally does not create a generic plugin marketplace or a fully runtime-selectable custom-provider execution path yet.
- Restricting the first custom source to local `file://` manifest URLs is narrower than a remote URL design, but it preserves the app's local-first posture and avoids broad installer risk in this phase.

### 2026-03-20
Decision:
- Keep optional enhanced-provider UX polish in-place inside existing Advanced Runtime Options and result surfaces, with no separate management page.

Context:
- Install triggers and status polling were already implemented, but wording and fallback visibility still felt too engineering-heavy for normal product use.

Chosen option:
- Tighten install/retry/failure copy to stay compact and action-oriented.
- Keep failure guidance to the shortest actionable step instead of dumping long lists.
- Add a lightweight result-side summary showing requested mode vs provider actually used, including fallback detection hints.

Tradeoffs:
- This improves day-to-day clarity without scope growth, but full install log/history viewing remains deferred to advanced-only future work.

### 2026-03-20
Decision:
- Implement optional enhanced-provider install UX directly inside existing Advanced Runtime Options provider-selection cards, with compact inline actions and backend status polling.

Context:
- Backend install and diagnostics foundations were already in place, but users still needed to leave provider selection semantics mentally to understand how to install unavailable enhanced providers.
- Product constraints required keeping the runtime panel compact and avoiding a separate package-manager style admin screen.

Chosen option:
- Keep `Auto` prominent and unchanged as the default.
- Keep built-in provider options simple and immediately selectable.
- Add inline `Install`, `Retry Install`, and `Install & Use` actions only for optional enhanced providers when unavailable.
- Poll backend install status in a compact way and refresh runtime availability after completion.

Tradeoffs:
- This keeps scope tight and user flow clear, but detailed install history/log UI is deferred.

### 2026-03-20
Decision:
- Add an additive backend provider-capability and install-management foundation for optional enhanced providers, while preserving current defaults and fallback behavior.

Context:
- Runtime diagnostics already exposed selected provider and availability at a basic level, but productized optional stronger providers needed explicit metadata, install state, and backend-owned install actions.
- The app must stay local-first and should not force heavy model/runtime downloads during normal install/startup.

Chosen option:
- Keep the existing built-in provider layer unchanged as default behavior.
- Introduce provider capability manifests for known options (including demucs, basic-pitch, demucs-drums).
- Extend runtime diagnostics provider options with additive metadata (installed, available, installable, missing reason, help/status text, layer flags, recommendation).
- Add explicit backend install actions plus install-status tracking with structured started/completed/failed responses and actionable failure reasons.
- Keep install state/log ownership on backend-local filesystem paths.

Tradeoffs:
- Adds backend runtime metadata/installation complexity, but keeps the pipeline contract stable and avoids frontend-buried install logic.
- Installation remains environment-sensitive (local Python + package compatibility), so failures are surfaced with structured guidance rather than hidden retries.

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
