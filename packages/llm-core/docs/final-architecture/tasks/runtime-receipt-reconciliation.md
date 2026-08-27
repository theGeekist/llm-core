---
id: runtime-receipt-reconciliation
title: Receipt fencing and ambiguous-effect recovery
stage: qualification
status: done
evidence_milestone: bb7f7f7
priority: high
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
  - packages/llm-core/src/features/tooling/types.ts
  - packages/llm-core/src/features/tooling/runtime.ts
  - packages/llm-core/tests/evidence/**
  - packages/llm-core/tests/control/**
  - packages/llm-core/tests/application/tool-execution/**
  - packages/llm-core/tests/specification-compiler/authority.test.ts
  - packages/llm-core/docs/final-architecture/tasks/runtime-receipt-reconciliation.md
required_reading:
  - path: docs/orchestration/controlled-tool-execution.md
    reason: "Preserve durable fencing, ambiguity and recovery invariants in the public journey."
read_scope:
  - docs/orchestration/controlled-tool-execution.md
  - packages/llm-core/src/contracts/**
  - packages/llm-core/src/features/state/**
review_owner: coordinator
updated_at: 2026-08-02
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

Claimed by `codex-root` on 2026-08-02 from `9920425b37ac8e83d94dcd1caad171e03113f34c`.
The user explicitly authorized work in the shared `main` checkout; unrelated
adapter-task and specification-type changes are preserved.

Implemented durable receipt ownership, downstream fence propagation,
stale-effect reconciliation, hardened external evidence snapshots, and focused
race/crash-window coverage on 2026-08-02. Coordinator review passed on
2026-08-02.

The coordinator review on 2026-08-02 formally expanded `write_scope` to the
three exact shared tooling/runtime/authority-fixture files required to complete
the fence-aware execution migration and its typecheck gate.

## Handoff

### Implementation summary

- Added journal-assigned, expiring owner fences and fenced append conflict
  results. A journal alone decides whether an existing lease is stale.
- Added portable reconciliation request/result records. Known outcomes require
  an authoritative evidence reference; unresolved outcomes become
  `reconciliation_required` rather than triggering a retry.
- `executeControlledTool` now claims and verifies its fence before invoking a
  tool and passes the receipt ID, owner and token to qualified providers for
  enforcement at their mutation boundary. Fence loss leaves the durable
  `started` fact for reconciliation.
- Added `reconcileControlledToolReceipt`, which never invokes the tool. It
  claims only a stale `started` or `indeterminate` receipt, preserves any
  cancellation request, and records the authoritative outcome or ambiguity.
- Reconciler responses are treated as hostile runtime values. Only exact
  variants, canonical immutable `EvidenceRef` snapshots and an allowlisted safe
  unresolved reason can enter durable receipts and events.

### Verification

- `bun test packages/llm-core/tests/evidence packages/llm-core/tests/control packages/llm-core/tests/application/tool-execution` — passed: 55 tests.
- `bun run typecheck:packages` and `bun run typecheck:tests` — both passed after
  the caller migration. The latest shared-checkout rerun is blocked by
  concurrent AI-SDLC, BMAD and Spec Kit work; it reports no task-owned compile
  diagnostics.
- `bun run lint` — the repository-wide run is blocked by unrelated concurrent
  AI-SDLC, BMAD and Spec Kit work. Task-scoped ESLint passes.
- Task-owned files pass Prettier; `git diff --check` passes.

### Remaining risk

Fencing prevents stale execution and receipt transitions only when the journal
and a qualified adapter honor the fence. It cannot revoke a generic external
request that was already issued; that result is intentionally reconciled from
authoritative external evidence.

### Shared-file integration

The coordinator explicitly expanded task ownership to the tooling type/runtime
files and specification-authority fixture. The executor fence contract,
reconciliation runtime export and required caller fields are integrated in
those files.
