---
architecture_version: 2
id: capabilities-operational-evidence
title: Usage receipts and observability projection
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
  - language-rollout
decision_dependencies:
  - ADR-003
  - ADR-004
  - ADR-005
  - ADR-013
conflicts_with:
  - runtime-receipt-reconciliation
write_scope:
  - packages/llm-core/src/features/evidence/**
  - packages/llm-core/src/features/model/**
  - packages/llm-core/src/adapters/observability/**
  - packages/llm-core/tests/evidence/**
  - packages/llm-core/tests/adapters/observability/**
  - docs/capabilities/evidence.md
  - docs/capabilities/model.md
  - packages/llm-core/internal/final-architecture/tasks/capabilities-operational-evidence.md
read_scope:
  - packages/llm-core/src/contracts/**
  - packages/llm-core/src/features/control/**
  - packages/llm-core/src/application/**
review_owner: coordinator
updated_at: 2026-08-01
---

# capabilities-operational-evidence — Usage receipts and observability projection

## Objective

Make model usage attributable and project canonical redacted events to
observability systems without conflating traces, evidence, pricing, or an audit
store.

## In scope

- `UsageReceipt` contracts binding observed usage to invocation, resolved
  model/profile, provider request identity when supplied, and an explicit
  attribution disposition.
- Explicit budget-decision evidence. Cost is recorded only when a verified
  composition-provided price source and currency basis are available.
- An optional OpenTelemetry projection/export port with declared sampling,
  redaction, delivery and retention behavior.
- Tests for trace/event correlation, redaction, exporter failure isolation,
  unknown price, and no accidental evidence disclosure.

## Out of scope

- An OpenTelemetry SDK dependency in the core, a price catalogue, billing
  ledger, signed-evidence service, telemetry collector, or retention backend.
  Provenance-bearing estimates, provider reconciliation and routing
  recommendations are the dependent `capabilities-cost-intelligence` task.

## Acceptance criteria

- A trace exporter cannot gate or replay a model or tool effect.
- The canonical evidence event remains the source of truth; trace/span data is
  correlation only.
- Missing or stale pricing yields an explicit unavailable disposition, never a
  guessed cost.
- Usage/cost records do not expose provider credentials or unredacted native
  payloads.

## Verification

```sh
bun test packages/llm-core/tests/evidence packages/llm-core/tests/adapters/observability
bun run typecheck:packages
bun run typecheck:tests
bun run lint
```

## Work log

Planned from ADR-013; not claimed.

## Handoff

Pending.
