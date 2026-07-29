---
id: P0-110
title: Implement tool control and execution-event kernel
phase: P0.2
status: proposed
priority: P0
preferred_owner_kind: codex
owner: null
owner_kind: null
lease_started_at: null
lease_expires_at: null
base_sha: null
branch: null
worktree: null
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

## Handoff
