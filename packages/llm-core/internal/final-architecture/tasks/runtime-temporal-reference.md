---
architecture_version: 2
id: runtime-temporal-reference
title: Temporal durable execution reference
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
  - runtime-receipt-reconciliation
  - capabilities-runtime-conformance
decision_dependencies:
  - ADR-005
  - ADR-006
  - ADR-007
  - ADR-013
conflicts_with:
  - adapters-protocol-qualification
  - adapter-strands-runtime-release
write_scope:
  - packages/llm-core/src/adapters/runtimes/temporal/**
  - packages/llm-core/tests/conformance/temporal/**
  - packages/llm-core/tests/adapters/runtimes/temporal/**
  - docs/adapters/runtime-conformance.md
  - packages/llm-core/internal/final-architecture/tasks/runtime-temporal-reference.md
read_scope:
  - packages/llm-core/src/contracts/**
  - packages/llm-core/src/features/control/**
  - packages/llm-core/src/features/evidence/**
  - packages/llm-core/src/features/state/**
  - packages/llm-core/src/application/**
review_owner: coordinator
updated_at: 2026-08-01
---

# runtime-temporal-reference — Temporal durable execution reference

## Objective

Qualify one service-backed durable reference path without changing the portable
meaning of a checkpoint, provider session, or external effect.

## In scope

- An internal Temporal adapter/reference using idempotent model and tool
  activities, version-pinned support declarations and conformance fixtures.
- Approval and cancellation signal/update mapping, durable timers and restart
  recovery.
- Replay, worker-loss, duplicate-delivery, retry-classification and ambiguous
  side-effect fixtures correlated to receipt reconciliation.
- An explicit runtime-owned `DurableExecutionHandle` mapping and documented
  unsupported semantics.

## Out of scope

- A Temporal server deployment, hosted worker fleet, universal checkpoint
  exchange, automatic exactly-once side effects, or a public adapter entrypoint
  before its own publication decision.

## Acceptance criteria

- A replay or restart does not re-run a known recorded effect.
- Model/tool activity retries preserve action, idempotency and receipt
  identities.
- Approval, cancellation, timer and terminal-run behavior are exercised across
  a real durable boundary, not a fake in-process scheduler.
- The support report distinguishes Temporal-owned history from portable state.

## Verification

```sh
bun test packages/llm-core/tests/conformance/temporal packages/llm-core/tests/adapters/runtimes/temporal
bun run typecheck:packages
bun run typecheck:tests
bun run lint
```

## Work log

Planned from ADR-013; not claimed.

## Handoff

Pending.
