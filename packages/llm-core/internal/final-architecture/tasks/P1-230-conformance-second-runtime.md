---
id: P1-230
title: Conformance suite and second runtime
phase: P1.2
status: proposed
priority: P1
preferred_owner_kind: codex
owner: null
owner_kind: null
lease_started_at: null
lease_expires_at: null
base_sha: null
branch: null
worktree: null
depends_on:
  - P0-150
  - P0-160
  - P0-170
decision_dependencies:
  - ADR-007
conflicts_with: []
write_scope:
  - packages/llm-core/tests/conformance/**
  - packages/llm-core/src/adapters/runtimes/**
  - packages/llm-core/internal/final-architecture/tasks/P1-230-conformance-second-runtime.md
read_scope:
  - packages/llm-core/src/contracts/**
  - packages/llm-core/src/features/**
  - packages/llm-core/src/application/**
review_owner: coordinator
updated_at: 2026-07-29
---

# P1-230 — Conformance suite and second runtime

## Objective

Prove the finalized contracts are portable by running shared conformance fixtures against the local runtime and one non-TypeScript runtime boundary.

## Deliverables

- Conformance fixtures for model, tool, control, event, state, and continuation behavior.
- A deterministic fake-remote adapter for fault and replay cases.
- One bounded second-runtime bridge selected when the task is claimed.
- A compatibility report covering supported, projected, and unsupported semantics.

## Acceptance criteria

- The same fixtures exercise local and remote-style execution.
- Transport and provider details remain inside adapter scope.
- Unsupported semantics fail explicitly rather than silently degrading.
- Shared manifest, export, and fixture edits remain coordinator-owned.

## Verification

```sh
bun test packages/llm-core/tests/conformance
bun run typecheck:packages
```

## Work log

- Not started.

## Handoff

- None.
