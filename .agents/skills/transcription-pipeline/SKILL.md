---
name: transcription-pipeline
description: Use this skill when working on audio upload, source separation, transcription providers, note-event normalization, or export pipeline code.
---

# Transcription Pipeline Skill

## Purpose
Help implement and maintain the backend processing pipeline for the AI sheet music generator.

## Project Assumptions
- Audio input may be mixed or isolated.
- The system should support provider-based source separation.
- Piano and drums are the first-class instruments.
- All providers must normalize their output into the shared NoteEvent schema.

## Preferred Workflow
1. inspect the relevant backend and shared schema files
2. identify where provider interfaces belong
3. keep model-specific logic behind adapters
4. normalize outputs immediately
5. keep exports independent of provider internals
6. update docs if API contracts change

## Guardrails
- do not hardcode provider-specific output shapes into frontend-facing APIs
- do not mix file storage code with transcription logic
- do not claim accuracy improvements without validation
- avoid giant "god modules"

## Expected Deliverables
- provider interface
- provider implementation or stub
- normalized output types
- API route integration
- tests or validation scaffolding
- updated docs