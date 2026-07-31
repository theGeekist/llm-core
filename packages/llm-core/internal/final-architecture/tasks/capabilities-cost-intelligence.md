---
architecture_version: 2
id: capabilities-cost-intelligence
title: Cost attribution, budgets and routing evidence
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
  - capabilities-operational-evidence
  - capabilities-evaluation-qualification
decision_dependencies:
  - ADR-004
  - ADR-005
  - ADR-013
  - ADR-014
conflicts_with:
  - adapter-strands-runtime
write_scope:
  - packages/llm-core/src/features/evidence/**
  - packages/llm-core/src/features/model/**
  - packages/llm-core/src/features/evaluation/**
  - packages/llm-core/src/application/**
  - packages/llm-core/tests/evidence/**
  - packages/llm-core/tests/model/**
  - packages/llm-core/tests/evaluation/**
  - docs/capabilities/evidence.md
  - docs/capabilities/model.md
  - docs/capabilities/evaluation.md
  - packages/llm-core/internal/final-architecture/tasks/capabilities-cost-intelligence.md
read_scope:
  - packages/llm-core/src/contracts/**
  - packages/llm-core/src/features/control/**
review_owner: coordinator
updated_at: 2026-08-01
---

# capabilities-cost-intelligence — Cost attribution, budgets and routing evidence

## Objective

Turn attributable usage into provenance-bearing estimates, reconciled provider
costs, budget decisions and evaluation-backed routing recommendations without
making the kernel a billing platform.

## In scope

- Separate observed usage receipts, versioned price-snapshot estimates and
  authoritative provider reconciliation records.
- Workflow/run/step/model/connector/cache attribution with explicit partial or
  unavailable dispositions and currency separation.
- Pre-dispatch, bounded mid-run and post-run budget decisions with allow, warn,
  reroute, stop and overrun evidence.
- Capability/quality/privacy/residency/latency/cost routing inputs and held-out
  counterfactual evaluation for model recommendations.
- Cache receipts distinguishing actual usage, reused output and estimated
  avoided usage.

## Out of scope

- A price catalogue, exchange-rate authority, invoice, payment flow, hosted
  analytics backend, or scraping consumer product-plan usage pages.

## Acceptance criteria

- Estimates always identify source version, effective time, currency,
  assumptions and uncertainty/disposition; they cannot deserialize as charges.
- Reconciliation preserves both the original estimate and provider fact.
- Budget interruption does not alter usage already observed or imply an
  external effect was cancelled.
- A cheaper-model recommendation is emitted only after capability and quality
  gates with reproducible evaluation evidence.

## Verification

```sh
bun test packages/llm-core/tests/evidence packages/llm-core/tests/model packages/llm-core/tests/evaluation
bun run typecheck:packages
bun run typecheck:tests
bun run lint
```

## Work log

Planned from ADR-014; not claimed.

## Handoff

Pending.
