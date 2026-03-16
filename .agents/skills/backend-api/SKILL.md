---
name: backend-api
description: Use this skill when working on FastAPI routes, job orchestration, file handling, processing status, or result delivery.
---

# Backend API Skill

## Purpose
Help implement the backend API and orchestration layer.

## API Responsibilities
- create processing jobs
- store or reference uploaded files
- dispatch pipeline stages
- return status
- return normalized results
- provide export endpoints

## Guardrails
- keep endpoints small and explicit
- prefer structured response models
- separate transport models from internal processing logic
- make status transitions easy to reason about

## Expected Deliverables
- FastAPI routers
- pydantic models
- service layer functions
- error handling
- clear status values