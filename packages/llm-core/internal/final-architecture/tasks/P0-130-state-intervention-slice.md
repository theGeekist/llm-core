---
architecture_version: 2
id: P0-130
title: Implement state and intervention vertical slice
phase: P0.3
status: in_progress
priority: P0
preferred_owner_kind: codex
owner: codex-root
owner_kind: codex
lease_started_at: 2026-07-29T19:15:00+08:00
lease_expires_at: 2026-07-30T19:15:00+08:00
base_sha: 6b9838c
branch: task/P0-130-codex
worktree: /Users/jasonnathan/Repos/@theGeekist/llm-core/.worktrees/P0-130-codex
depends_on:
  - P0-110
decision_dependencies:
  - ADR-005
  - ADR-006
conflicts_with:
  - P0-110
write_scope:
  - packages/llm-core/src/features/state/**
  - packages/llm-core/src/application/workflow/**
  - packages/llm-core/tests/state/**
  - packages/llm-core/tests/application/workflow/**
  - packages/llm-core/internal/final-architecture/tasks/P0-130-state-intervention-slice.md
review_owner: coordinator
updated_at: 2026-07-29
---

# P0-130 — Implement State and Intervention Vertical Slice

## Objective

Convert one workflow approval path to explicit state lifetimes and
action-bound intervention decisions.

## In scope

Live continuation, snapshot, resumable checkpoint, durable handle,
compatibility records, resume strategy and one workflow resume path.

## Out of scope

Interaction sessions, external durable engine, entire workflow-directory move
and public export convergence.

## Acceptance criteria

- Live continuation cannot masquerade as JSON checkpoint data.
- Incompatible runtime/schema/code resume is rejected.
- Completed side effects are not re-executed.
- Approve, deny, defer, edit, cancel and escalate remain distinct.

## Verification

```sh
bun test packages/llm-core/tests/state packages/llm-core/tests/application/workflow
bun run typecheck:packages
```

## Work log

- 2026-07-29T19:15:00+08:00 — Reassigned from the retired Claude allocation
  and claimed by the Codex coordinator for delegated subagent execution.
- 2026-07-29 — Implementation started in the assigned isolated worktree.

## Handoff
