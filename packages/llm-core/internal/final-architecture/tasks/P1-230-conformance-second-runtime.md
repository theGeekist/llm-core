---
architecture_version: 2
id: P1-230
title: Conformance suite and second runtime
phase: P1.2
status: in_progress
priority: P1
preferred_owner_kind: codex
owner: codex-conformance-runtime
owner_kind: codex
lease_started_at: 2026-07-30T03:44:18+08:00
lease_expires_at: 2026-08-01T03:44:18+08:00
base_sha: e72d312e3f9d966acc2b96548c42b122498b3315
branch: task/P1-230-conformance
worktree: /Users/jasonnathan/Repos/@theGeekist/llm-core/.worktrees/P1-230-conformance
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
updated_at: 2026-07-30
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

- 2026-07-30T03:44:18+08:00 — Claimed by the Codex conformance/runtime
  worker after P0-150 completed and merged at
  `e72d312e3f9d966acc2b96548c42b122498b3315`.
- 2026-07-30 — The architecture coordinator selected PydanticAI as the first
  bounded Python reference runtime. The research assessment identifies it as
  the default typed, provider-neutral Python substrate and the closest direct
  precedent for llm-core agent specifications and model profiles. The adapter
  must still declare versioned support and explicit semantic loss.
- 2026-07-30T03:47:00+08:00 — Implementation started. The bridge is bounded to
  the assessed PydanticAI v2 line and remains transport-neutral; shared
  conformance fixtures exercise the local runner and a deterministic
  fake-remote runner separately from the Python runtime declaration.

## Handoff

- None.
