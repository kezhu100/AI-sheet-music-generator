---
name: frontend-ui
description: Use this skill when working on upload UI, job status, waveform/timeline preview, track list, or notation preview components.
---

# Frontend UI Skill

## Purpose
Help build a clean and practical frontend for the AI sheet music generator.

## UI Priorities
1. usability
2. end-to-end flow
3. clarity of status
4. editability
5. visual polish

## MVP Components
- audio upload form
- job status panel
- results summary
- track selector
- piano-roll or timeline preview
- export actions

## Guardrails
- do not overdesign before end-to-end flow works
- keep components focused
- keep API calls in hooks or service modules
- avoid embedding music-processing logic in React components

## Expected Deliverables
- composable React components
- typed frontend API client
- simple and readable layout
- empty/loading/error states