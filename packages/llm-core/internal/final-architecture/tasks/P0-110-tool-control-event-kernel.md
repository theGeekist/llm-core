---
id: P0-110
title: Implement tool control and execution-event kernel
phase: P0.2
status: claimed
priority: P0
preferred_owner_kind: codex
owner: codex-root
owner_kind: codex
lease_started_at: 2026-07-29T16:49:00+08:00
lease_expires_at: 2026-07-30T16:49:00+08:00
base_sha: e4ebd2b
branch: task/P0-110-codex
worktree: /Users/jasonnathan/Repos/@theGeekist/llm-core/.worktrees/P0-110-codex
depends_on:
  - P0-100
decision_dependencies:
  - ADR-003
  - ADR-005
conflicts_with:
  - P0-130
write_scope:
  - packages/llm-core/src/features/tooling/**
  - packages/llm-core/src/features/control/**
  - packages/llm-core/src/features/evidence/**
  - packages/llm-core/src/application/tool-execution/**
  - packages/llm-core/tests/tooling/**
  - packages/llm-core/tests/control/**
  - packages/llm-core/tests/evidence/**
  - packages/llm-core/tests/application/tool-execution/**
  - packages/llm-core/internal/final-architecture/tasks/P0-110-tool-control-event-kernel.md
review_owner: coordinator
updated_at: 2026-07-29
---

# P0-110 — Implement Tool Control and Execution-Event Kernel

## Objective

Prove one complete tool path:
policy → approval when required → concurrency/sandbox decision → execution →
receipt → canonical event.

## In scope

Tool specs/calls/results, effect classes, action digest, policy and approval
records, receipts, `ExecutionEvent`, `EventSink`, cancellation and exclusive
execution.

## Out of scope

HITL recipe migration, UI projections, provider-specific tool adapters and root
exports.

## Acceptance criteria

- Changed arguments invalidate prior approval.
- Exclusive tools do not use unconditional parallel execution.
- Idempotency and cancellation produce explicit receipts.
- Policy, approval and execution share run/tool-call identities.
- Sensitive/native data follows ADR-003/005 rules.

## Verification

```sh
bun test packages/llm-core/tests/tooling packages/llm-core/tests/control packages/llm-core/tests/evidence packages/llm-core/tests/application/tool-execution
bun run typecheck:packages
```

## Work log

- 2026-07-29T16:49:00+08:00 — Claimed by `codex-root` after P0-100 completed
  and P0-120 was assigned to Claude Code in a disjoint worktree.

## Handoff
