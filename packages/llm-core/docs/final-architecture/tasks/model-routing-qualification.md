---
architecture_version: 2
id: model-routing-qualification
title: Evaluation-backed model routing qualification
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
  - capabilities-evaluation-qualification
decision_dependencies:
  - ADR-004
  - ADR-013
  - ADR-014
  - ADR-015
conflicts_with:
write_scope:
  - packages/llm-core/src/features/model/**
  - packages/llm-core/src/features/evaluation/**
  - packages/llm-core/src/application/model-routing/**
  - packages/llm-core/tests/model/**
  - packages/llm-core/tests/evaluation/**
  - packages/llm-core/tests/application/model-routing/**
  - packages/llm-core/docs/final-architecture/tasks/model-routing-qualification.md
read_scope:
  - packages/llm-core/src/features/evidence/**
review_owner: coordinator
updated_at: 2026-08-02
---

# model-routing-qualification — Evaluation-backed model routing qualification

## Objective

Produce counterfactual routing recommendations from cost facts and reproducible
evaluation evidence after capability, quality, privacy and residency gates.

## In scope

- Capability, quality, privacy, residency, latency and cost routing inputs.
- Held-out counterfactual evaluation with dataset/split/evaluator lineage.
- Recommendations and explanations that can be consumed by a separate policy
  decision.

## Out of scope

- Automatic provider selection, budget enforcement, price-source ownership or
  a hosted optimizer/training service.

## Acceptance criteria

- A cheaper-model recommendation never bypasses capability or quality gates.
- Recommendations retain dataset, split, evaluator and price-fact provenance.
- Routing remains advisory unless a separate policy decision authorizes it.
- Missing or stale evidence yields an explicit unavailable result rather than a
  guessed cheaper route.

## Verification

```sh
bun test packages/llm-core/tests/model packages/llm-core/tests/evaluation packages/llm-core/tests/application/model-routing
bun run typecheck:packages
bun run typecheck:tests
bun run lint
bun run --cwd packages/llm-core release:build
```

## Work log

Replaces the routing portion of `capabilities-cost-intelligence`; not claimed.

## Handoff

Pending.
