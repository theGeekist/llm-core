---
architecture_version: 2
id: runtime-tool-execution-decomposition
title: Decompose controlled tool execution orchestration
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
  - architecture-source-layout-normalization
  - runtime-receipt-reconciliation
decision_dependencies:
  - ADR-005
  - ADR-006
  - ADR-013
  - ADR-015
conflicts_with:
  - runtime-tools-front-boundary
write_scope:
  - packages/llm-core/src/application/tool-execution/**
  - packages/llm-core/tests/application/tool-execution/**
  - packages/llm-core/internal/final-architecture/tasks/runtime-tool-execution-decomposition.md
read_scope:
  - packages/llm-core/src/features/control/**
  - packages/llm-core/src/features/evidence/**
  - packages/llm-core/src/features/tooling/**
review_owner: coordinator
updated_at: 2026-08-03
---

# runtime-tool-execution-decomposition — Decompose controlled tool execution orchestration

## Objective

Split the oversized controlled-execution implementation into cohesive private
collaborators without changing its public operation, guarantees or sync/async
behavior.

## In scope

- Separate receipt persistence/fencing, reconciliation, policy/approval,
  cancellation, invocation and event projection concerns.
- Retain one public controlled-execution facade and explicit dependency flow.
- Characterization tests for success, denial, cancellation, fence loss,
  duplicate replay, ambiguity and reconciliation.

## Out of scope

- New behavior, new public exports, connector work or a generic workflow
  engine.

## Acceptance criteria

- No private collaborator becomes a second public execution path.
- Existing portable records, error semantics and receipt transitions are
  unchanged.
- Fully synchronous inputs remain synchronous; no unconditional Promise is
  introduced.
- Every resulting hand-written implementation and test module satisfies the
  500-SLOC rule. A narrow coordinator waiver must name the remaining cohesive
  exception and a follow-up task; “where practical” is not sufficient evidence.

## Verification

```sh
bun test packages/llm-core/tests/application/tool-execution
bun run typecheck:packages
bun run typecheck:tests
bun run lint
bun run --cwd packages/llm-core release:build
```

## Work log

Planned by ADR-015; not claimed.

## Handoff

Pending.
