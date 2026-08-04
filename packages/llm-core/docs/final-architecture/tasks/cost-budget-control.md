---
architecture_version: 2
id: cost-budget-control
title: Budget decision control
stage: qualification
status: proposed
priority: normal
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
  - cost-facts
  - runtime-receipt-reconciliation
decision_dependencies:
  - ADR-004
  - ADR-005
  - ADR-013
  - ADR-014
  - ADR-015
conflicts_with:
write_scope:
  - packages/llm-core/src/features/evidence/**
  - packages/llm-core/src/features/control/**
  - packages/llm-core/src/application/budget/**
  - packages/llm-core/tests/evidence/**
  - packages/llm-core/tests/control/**
  - packages/llm-core/tests/application/budget/**
  - docs/capabilities/evidence.md
  - packages/llm-core/docs/final-architecture/tasks/cost-budget-control.md
read_scope:
  - packages/llm-core/src/application/tool-execution/**
  - packages/llm-core/src/application/agent/**
  - packages/llm-core/src/application/workflow/**
review_owner: coordinator
updated_at: 2026-08-03
---

# cost-budget-control — Budget decision control

## Objective

Apply cost facts to explicit pre-dispatch, bounded mid-run and post-run budget
decisions without rewriting observed usage or claiming an external effect was
cancelled.

## In scope

- Versioned budget inputs and allow, warn, reroute, stop and overrun decisions.
- Pre-dispatch checks, bounded checkpoints during a run and terminal evidence.
- Interaction with the existing policy, cancellation and receipt boundaries.
- One canonical evolution of the existing public `BudgetDecisionEvidence`
  record and its `UsageReceipt` binding; no parallel budget-evidence family.

## Out of scope

- Cost estimation, provider reconciliation, model-quality recommendations,
  billing enforcement, execution-gateway wiring or a hosted quota service.

## Acceptance criteria

- Allow, warn, reroute, stop and overrun are explicit decisions with evidence.
- Existing budget evidence, validators and usage-receipt fixtures migrate
  atomically; the old decision vocabulary does not remain as a second public
  contract.
- Budget interruption preserves usage already observed.
- The control path remains distinct from price/catalogue providers and model
  routing recommendations.
- A stop decision records cancellation intent and never rewrites an already
  observed effect or usage fact.
- `reroute` is a non-executing disposition with no implicit target. A new model
  dispatch still requires a separately evidenced routing recommendation and
  policy authorization.

## Verification

```sh
bun test packages/llm-core/tests/evidence packages/llm-core/tests/control packages/llm-core/tests/application/budget
bun run typecheck:packages
bun run typecheck:tests
bun run lint
bun run --cwd packages/llm-core release:build
```

## Work log

Replaces the budget portion of `capabilities-cost-intelligence`; not claimed.

## Handoff

Pending.
