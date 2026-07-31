---
architecture_version: 2
id: runtime-receipt-reconciliation
title: Receipt fencing and ambiguous-effect recovery
stage: qualification
status: proposed
priority: high
preferred_owner_kind: codex
owner:
owner_kind:
lease_started_at:
lease_expires_at:
base_sha:
branch:
worktree:
depends_on:
  - core-tool-control-events
  - core-state-interventions
  - language-rollout
decision_dependencies:
  - ADR-005
  - ADR-006
  - ADR-013
conflicts_with:
  - capabilities-operational-evidence
write_scope:
  - packages/llm-core/src/features/evidence/**
  - packages/llm-core/src/features/control/**
  - packages/llm-core/src/application/tool-execution/**
  - packages/llm-core/tests/evidence/**
  - packages/llm-core/tests/control/**
  - packages/llm-core/tests/application/tool-execution/**
  - packages/llm-core/internal/final-architecture/tasks/runtime-receipt-reconciliation.md
read_scope:
  - packages/llm-core/src/contracts/**
  - packages/llm-core/src/features/state/**
review_owner: coordinator
updated_at: 2026-08-01
---

# runtime-receipt-reconciliation — Receipt fencing and ambiguous-effect recovery

## Objective

Complete the deferred durable-receipt boundary so recovered processes cannot
mistake ownership, repeat an ambiguous effect, or silently lose recovery
evidence.

## In scope

- Owner fencing and durable lease identity for started receipts.
- Explicit staleness policy, reconciliation request/result records, and
  recovery evidence for `started` and `indeterminate` effects.
- Idempotent recovery paths that require an authoritative external outcome or
  report an unresolved ambiguous result.
- Race and crash-window fixtures covering fencing loss, duplicate workers,
  cancellation, stale recovery and known completed effects.

## Out of scope

- A durable workflow engine, a database implementation, generic exactly-once
  external effects, or automatic compensation for an unobservable side effect.

## Acceptance criteria

- A stale or unfenced owner cannot transition or execute a receipt.
- Reconciliation never guesses whether an external effect occurred.
- Recovery remains explicit evidence and does not turn a cancellation request
  into proof that the effect stopped.
- Existing policy, approval, action digest and idempotency bindings remain
  unchanged.

## Verification

```sh
bun test packages/llm-core/tests/evidence packages/llm-core/tests/control packages/llm-core/tests/application/tool-execution
bun run typecheck:packages
bun run typecheck:tests
bun run lint
```

## Work log

Planned from ADR-013; not claimed.

## Handoff

Pending.
