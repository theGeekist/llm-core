---
architecture_version: 2
id: aifsd-delivery-characterization
title: Characterize one governed AIFSD delivery slice
stage: applications
status: cancelled
replaced_by:
  - aifsd/local-delivery-vertical-slice
priority: critical
preferred_owner_kind: coordinator
owner:
owner_kind:
lease_started_at:
lease_expires_at:
base_sha:
branch:
worktree:
depends_on:
  - architecture-runtime-ownership-correction
  - adapter-openspec
  - adapter-coding-agent-integration
  - capabilities-evaluation-qualification
  - capabilities-operational-evidence
decision_dependencies:
  - ADR-009
  - ADR-016
conflicts_with: []
write_scope:
  - apps/aifsd-delivery-characterization/**
  - docs/applications/aifsd-delivery-characterization.md
  - packages/llm-core/docs/final-architecture/tasks/aifsd-delivery-characterization.md
required_reading:
  - path: packages/aifsd/docs/final-architecture/LLM-CORE-PARITY.md
    reason: "Retain the cancelled llm-core brief as provenance while using AIFSD's adopted disposition."
  - path: packages/aifsd/docs/final-architecture/tasks/local-delivery-vertical-slice.md
    reason: "Use the committed AIFSD replacement task as current product authority."
read_scope:
  - packages/aifsd/docs/final-architecture/LLM-CORE-PARITY.md
  - packages/aifsd/docs/final-architecture/tasks/local-delivery-vertical-slice.md
review_owner: human
updated_at: 2026-08-04
---

# aifsd-delivery-characterization — Characterize one governed AIFSD delivery slice

## Objective

Prove a complete request-to-release-decision journey using existing kernel
contracts and real delivery integrations, without introducing a shared SDK.

## Acceptance criteria

- The slice covers understanding, accepted specification, coding-agent work,
  tests, evaluation, independent review, approval, evidence and release
  decision.
- Every external effect has explicit host/integration ownership.
- The characterization duplicates its application orchestration locally and
  does not widen the kernel.
- Missing contracts and product responsibilities are recorded from executable
  evidence.

## Verification

Defined with the selected repository fixture and coding-agent integration.

## Work log

- 2026-08-04 — Cancelled before implementation and forwarded toward the planned
  `aifsd/local-delivery-vertical-slice` product-owned characterization. This is a
  handoff target, not committed replacement authority.
- 2026-08-07 — AIFSD committed the destination task authority. The provisional
  forward target became an exact cross-package replacement whose Inputs retain
  this task's governed delivery journey.

## Handoff

`llm-core` retains only the portable kernel prerequisites. Product work resumes
under `aifsd/local-delivery-vertical-slice`.
