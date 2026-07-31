---
architecture_version: 2
id: applications-desktop
title: Desktop operator and local-profiler application
stage: applications
status: proposed
priority: medium
preferred_owner_kind: codex
owner:
owner_kind:
lease_started_at:
lease_expires_at:
base_sha:
branch:
worktree:
depends_on:
  - applications-client-contract
decision_dependencies:
  - ADR-006
  - ADR-014
conflicts_with:
write_scope:
  - apps/desktop/**
  - docs/applications/desktop.md
  - packages/llm-core/internal/final-architecture/tasks/applications-desktop.md
read_scope:
  - packages/llm-client/**
  - packages/llm-core/package.json
review_owner: coordinator
updated_at: 2026-08-01
---

# applications-desktop — Desktop operator and local-profiler application

## Objective

Deliver the full end-user operator surface for connections, runs, approvals and
cost profiling, with explicit local-versus-remote execution and platform
security boundaries.

## In scope

- Conversations/runs, approval inbox, connector management, usage and cost
  drill-down, budget controls and evaluation-backed model recommendations.
- OS secure-storage and OAuth callback adapters, encrypted local app storage,
  account/tenant switching and redacted diagnostic export.
- A local profiler and optional local connector host using the shared client
  contract; durable and long-running execution delegates to a qualified host.
- Signed update, migration, crash recovery and supported-OS release posture.

## Out of scope

- Storing raw credentials in shared app state, scraping consumer subscription
  pages, claiming the UI process is durable, or adding desktop concerns to the
  kernel root.

## Acceptance criteria

- The app survives restart without duplicating a submitted controlled action.
- OAuth callback and secure-store tests cover replay, account switching,
  revocation and unavailable vault state.
- Cost views label observed usage, estimates, reconciliation and avoided usage
  distinctly.
- Framework and packaging choice is recorded with update/signing and minimum-OS
  implications before implementation is made ready.

## Verification

The implementation task records framework-specific unit, integration,
packaging, signing, update and supported-OS smoke commands before claiming
review.

## Work log

Planned from ADR-014; not claimed.

## Handoff

Pending.
