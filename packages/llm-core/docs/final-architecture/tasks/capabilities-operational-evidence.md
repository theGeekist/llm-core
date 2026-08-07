---
architecture_version: 2
id: capabilities-operational-evidence
title: Usage receipts and observability projection
stage: qualification
status: done
evidence_milestone: pre-completion
priority: high
preferred_owner_kind: codex
owner: codex-operational-evidence
owner_kind: coordinator
lease_started_at: 2026-08-01T06:56:05Z
lease_expires_at: 2026-08-01T14:56:05Z
base_sha: df1e4f36cf3cbf46e820dcf04242de3d077e4a0c
branch: main
worktree: .
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
  - packages/llm-core/docs/final-architecture/tasks/capabilities-operational-evidence.md
required_reading:
  - path: docs/capabilities/evidence.md
    reason: "Preserve usage attribution, redaction and observability separation."
read_scope:
  - docs/capabilities/evidence.md
  - packages/llm-core/src/contracts/**
  - packages/llm-core/src/features/control/**
  - packages/llm-core/src/application/**
review_owner: coordinator
updated_at: 2026-08-01T12:56:01Z
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
  Provenance-bearing estimates and provider reconciliation are the dependent
  `cost-facts` task; budget control and routing qualification remain separate
  ADR-015 successors.

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

- 2026-08-01 — Coordinator claimed this task on `main`. It does not overlap
  the separate specification-api work, so no dedicated worktree is needed.
- 2026-08-01 — Implemented immutable resolved-model identities, closed usage
  receipts and budget-decision evidence, plus a private, redacted,
  failure-isolated OpenTelemetry projection port. No SDK, collector, pricing
  catalogue, billing record, or package entrypoint was added.
- 2026-08-01 — Focused evidence/observability tests, package and test
  typechecks, and lint passed before concurrent specification work introduced
  unrelated source-boundary and specification test failures. Awaiting review.
- 2026-08-01 — Addressed review feedback: complete attribution now requires
  every portable usage metric, while partial attribution must state the exact
  absent metric set. Added regressions for both overstatement cases.
- 2026-08-01 — Review passed. Completed and integrated on `main`.

## Handoff

Completed and integrated on `main`.

- Added exact model/profile attribution, provider request IDs when available,
  explicit partial/unavailable attribution, and explicit unavailable pricing.
- The projection exports only fixed canonical receipt/event facts and optional
  trace correlation. It omits extensions, authorized evidence, action digests,
  and provider/native payloads, schedules at most once, and ignores delivery
  failure.
- No public adapter front was added; ADR-013 reserves that publication for a
  dedicated release task.
- Verification: evidence/observability tests, source build typecheck, lint,
  formatting, schema freshness, and diff check passed.
