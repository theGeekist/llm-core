---
id: cost-facts
title: Usage, estimate and reconciled cost facts
stage: qualification
status: ready
priority: high
depends_on:
  - architecture-source-layout-normalization
  - capabilities-operational-evidence
decision_dependencies:
  - ADR-004
  - ADR-013
  - ADR-014
  - ADR-015
conflicts_with: []
write_scope:
  - packages/llm-core/src/features/evidence/**
  - packages/llm-core/tests/evidence/**
  - docs/capabilities/evidence.md
  - packages/llm-core/docs/final-architecture/tasks/cost-facts.md
required_reading:
  - path: packages/llm-core/docs/final-architecture/tasks/capabilities-cost-intelligence.md
    reason: "Retain the cancelled source task as provenance for the separated facts boundary."
  - path: docs/capabilities/evidence.md
    reason: "Preserve observed usage and unavailable-attribution semantics."
read_scope:
  - packages/llm-core/docs/final-architecture/tasks/capabilities-cost-intelligence.md
  - docs/capabilities/evidence.md
  - packages/llm-core/src/features/model/**
review_owner: coordinator
updated_at: 2026-08-02
---

# cost-facts — Usage, estimate and reconciled cost facts

## Objective

Represent attributable usage, provenance-bearing estimates, provider
reconciliation and cache attribution without introducing budget policy,
routing or billing infrastructure.

## In scope

- `UsageReceipt -> CostEstimate -> ReconciledCost` records with invocation,
  model/profile, provider request and source-version provenance.
- Stable correlation to the exact provider execution and evidence references
  supplied by the consuming composition, without interpreting project, task,
  proposal, acceptance or intervention meaning.
- Partial/unavailable attribution, currency separation and explicit cache reuse
  and avoided-usage facts.
- Ports for composition-owned price facts and authoritative provider
  reconciliation.

## Out of scope

- Budget decisions, routing recommendations, price catalogues, exchange-rate
  authority, invoices, payment flows or hosted analytics.
- Current Velocity conclusions, accepted-work definitions, comparison windows,
  Simple Assembly proposal or decision records, and Task Graph lifecycle or
  acceptance semantics.

## Acceptance criteria

- Estimates identify source version, effective time, currency, assumptions and
  disposition; they cannot deserialize as charges.
- Reconciliation preserves both estimate and provider fact.
- Partial/unavailable attribution and cache reuse remain explicit.
- Catalogues, exchange rates and invoices stay behind host-owned ports.
- Facts remain portable and cannot acquire current billing or execution
  authority through deserialization.
- Provider, model, invocation, evidence and correlation identities are retained
  independently, while absent or unverified usage and cost remain explicit
  unavailable facts rather than inferred zeroes.

## Verification

```sh
bun test packages/llm-core/tests/evidence
bun run typecheck:packages
bun run typecheck:tests
bun run lint
bun run --cwd packages/llm-core release:build
bun run test:package
bun run docs:check
bun run --cwd packages/llm-core format:check
```

## Work log

Replaces the facts portion of `capabilities-cost-intelligence`; not claimed.

## Handoff

Pending.
