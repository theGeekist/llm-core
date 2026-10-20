---
id: model-routing-qualification
title: Evaluation-backed model routing qualification
stage: qualification
status: proposed
priority: normal
depends_on:
  - architecture-source-layout-normalization
  - cost-facts
  - capabilities-evaluation-qualification
decision_dependencies:
  - ADR-004
  - ADR-013
  - ADR-014
  - ADR-015
conflicts_with: []
write_scope:
  - packages/llm-core/src/features/model/**
  - packages/llm-core/src/features/evaluation/**
  - packages/llm-core/src/application/model-routing/**
  - packages/llm-core/tests/model/**
  - packages/llm-core/tests/evaluation/**
  - packages/llm-core/tests/application/model-routing/**
  - packages/llm-core/docs/final-architecture/tasks/model-routing-qualification.md
required_reading:
  - path: packages/llm-core/docs/final-architecture/tasks/capabilities-cost-intelligence.md
    reason: "Retain the cancelled source task as provenance for advisory routing ownership."
  - path: docs/capabilities/model.md
    reason: "Preserve capability and provider-profile gates before routing recommendations."
  - path: docs/capabilities/evaluation.md
    reason: "Preserve held-out evaluation provenance and promotion separation."
read_scope:
  - packages/llm-core/docs/final-architecture/tasks/capabilities-cost-intelligence.md
  - docs/capabilities/model.md
  - docs/capabilities/evaluation.md
  - packages/llm-core/src/features/evidence/**
review_owner: coordinator
updated_at: 2026-10-20
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

## Candidate comparison, 20 October 2026

The [MiniMax M3.1 Flash announcement](https://www.minimax.io/blog/minimax-m31f)
reports nearly threefold speed and 70% lower overall agentic cost; these are
vendor workload claims, not a measured routing recommendation. Compare exact
provider tariffs and account eligibility separately. The
[OpenRouter free endpoint](https://openrouter.ai/minimax/minimax-m3.1-flash:free)
is a zero-token-price candidate, not an established free-quota or privacy
entitlement for a particular account. Qualify actual limits, provider identity,
reasoning/usage behavior and the existing compatible model adapter. Do not
assume a compatible intermediary preserves the direct provider's reasoning
defaults. Record strict privacy/residency settings and refused routes; do not
relax them or fall back to a paid model to complete the trial.

Use public/synthetic fixtures first, with no new subscription, top-up or paid
API call. Upstream retention/training/residency eligibility must be established
before private inputs. Preserve dataset/split/evaluator and accepted-result
checks, latency, observed usage, correction effort and every failed attempt.
Missing model usage remains unavailable, not zero. A configured zero token
tariff does not make host, setup, review and repair effort free.

[Clairic preview](https://developers.cloudflare.com/workers-ai/models/clairic/)
is typed extraction, not a generic chat-model replacement. Any host-selected
candidate retains source spans, missing-field and truncation evidence; model
confidence or forecast intervals do not establish factual correctness or
deterministic calculations. Qualify only the capability actually used through
existing application/integration ownership.
