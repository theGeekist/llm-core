---
id: runtime-tool-execution-decomposition
title: Decompose controlled tool execution orchestration
stage: qualification
status: done
priority: high
depends_on:
  - architecture-source-layout-normalization
  - runtime-receipt-reconciliation
decision_dependencies:
  - ADR-005
  - ADR-006
  - ADR-013
  - ADR-015
conflicts_with: []
write_scope:
  - packages/llm-core/src/application/tool-execution/**
  - packages/llm-core/tests/application/tool-execution/**
  - packages/llm-core/docs/final-architecture/tasks/runtime-tool-execution-decomposition.md
  - packages/llm-core/docs/final-architecture/STATUS.md
required_reading:
  - path: docs/orchestration/controlled-tool-execution.md
    reason: "Preserve one controlled execution front and its observable sync-or-async behaviour."
read_scope:
  - docs/orchestration/controlled-tool-execution.md
  - packages/llm-core/src/features/control/**
  - packages/llm-core/src/features/evidence/**
  - packages/llm-core/src/features/tooling/**
review_owner: coordinator
updated_at: 2026-08-04
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

- Claim: `codex-root` began implementation from
  `ca027dcc3f3b215d8cbd1f2eb376612e68d2f12e` with a lease through
  `2026-08-04T17:07:27+08:00`.
- Execution mode: shared canonical checkout on `main`.
- Execution rationale: the task owns a narrow source/test subtree, the primary
  checkout is clean and no concurrent task is active. A worktree would not
  remove the only potential coordination hazard: release reproducibility reads
  these modules when establishing its SLOC baseline.
- Concurrency evaluation: `architecture-release-reproducibility` remains
  proposed and unclaimed. Its write scope is disjoint, but any future SLOC
  baseline or final qualification must be generated after this decomposition,
  not concurrently with it.
- Concurrent task scopes: none at claim time.
- Swarm delegation: bounded agents decomposed the test suite and extracted the
  receipt-reconciliation collaborator under disjoint scopes; `codex-root`
  integrated and qualified the complete source/test change. A separate agent
  performed the final read-only review.
- Implementation: reduced `execute.ts` to the controlled-operation facade and
  extracted concept-owned private collaborators for authorization, event
  projection, execution control/invariants, invocation, receipt persistence
  and receipt reconciliation. `public.ts` still exposes only
  `executeControlledTool` and `reconcileControlledToolReceipt`.
- Test decomposition: replaced the 1,487-line scenario suite with shared
  execution fixtures and five behavior-owned suites covering authority and
  validation, authorization and idempotency, cancellation and delivery,
  receipt fencing, and receipt reconciliation. All 29 original scenario names
  remain present.
- Size evidence: every scoped source and test module is below 500 physical
  lines; the largest is
  `tests/application/tool-execution/authorization-and-idempotency.test.ts` at
  447 lines.
- Verification: focused execution tests pass (`29` tests, `122` expectations),
  source-boundary tests pass, root and scoped ESLint pass, the root SLOC gate
  checks `388` modules successfully, package and test typechecks pass, and
  `bun run --cwd packages/llm-core release:build` passes (`667` tests, `4`
  intentional skips).
- Review: an independent read-only agent reported no P0-P3 findings after
  checking public-surface stability, receipt ordering and fencing,
  cancellation/reconciliation safety, test preservation, naming/cohesion and
  the 500-SLOC boundary.
- Completion: coordinator review passed on 4 August 2026 and authorized the
  task status transition and task-scoped commit.

## Handoff

Coordinator review passed. Commit only this task's source, tests, task record
and runtime-specific status projection; keep the concurrent
`architecture-release-reproducibility` diff separate.
