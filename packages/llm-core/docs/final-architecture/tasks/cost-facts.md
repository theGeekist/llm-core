---
id: cost-facts
title: Usage, estimate and reconciled cost facts
stage: qualification
status: done
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
updated_at: 2026-09-04
---

# cost-facts: Usage, estimate and reconciled cost facts

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
- Exact execution facts that remain usable when a Current Velocity proof runs
  through an executor outside our control, without allowing that executor to
  define whether its output was accepted or improved the declared outcome.
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
- Repository, product, revenue or customer-outcome attribution.

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
- A provider or executor success state remains an execution fact. It cannot
  deserialize as repository acceptance, intervention success or a business
  outcome.

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

- Replaces the facts portion of `capabilities-cost-intelligence`.
- Implemented strict portable cost facts and snapshotting in `packages/llm-core/src/features/evidence/`:
  - `cost.ts`: `createCostEstimate`, `createReconciledCost`, and `deriveReconciliationDisposition`. Embeds the validated usage receipt, requires valued units to match its observations, and enforces structural invariants: unavailable estimates carry no money, amount, currency, or verified price source; provider record presence is biconditional with reconciled/divergent/unreconcilable dispositions; decimal equality is derived on string representations; provider identity and request ID drift are rejected. Provider records retain versioned source and evidence provenance.
  - `cost-cache.ts`: `createCacheAttributionRecord` embeds the validated receipt with cache reuse, avoided usage against prior observation or declared baseline, and zero monetary/charge semantics.
  - `cost-ports.ts`: `PriceFactPort` and `ProviderCostReconciliationPort` returning `MaybePromise` for synchronous or asynchronous host integration.
  - `snapshot.ts`: Shared parsing, validation, usage-unit snapshotting, decimal string normalization, and deep freeze helpers. Factories first cross the strict JSON boundary, rejecting accessors, array subclasses, sparse arrays, and prototype pollution.
  - `public.ts`: Facade export for evidence contracts.
- Added comprehensive unit and adversarial tests in `packages/llm-core/tests/evidence/`:
  - `cost-estimate.test.ts`: Invariant 1 enforcement, receipt-bound usage-unit provenance, hostile portable-input rejection, independent identities, and deep freeze.
  - `cost-reconciliation.test.ts`: Invariant 2 enforcement, decimal matching (`"1.50"` == `"1.5"`), divergence classifications, nested authority-field rejection, and provider provenance and identity checks.
  - `cost-cache.test.ts`: Cache reuse, avoided usage facts, zero charge invariant, and prototype pollution checks.
  - `cost-ports.test.ts`: Synchronous and asynchronous `MaybePromise` execution for both host ports.
- Updated public evidence capability documentation in `docs/capabilities/evidence.md`.
- All production files are under the 500-line target. The final declared gates pass: 49 focused evidence tests; aggregate package and test typechecks; sealed repository lint; package release build with 837 passing tests and four declared skips; isolated packed-package smoke tests; documentation checks; package formatting; and `git diff --check`.
- Independent review found four initial P1 gaps around nested disposition closure, hostile portable inputs, receipt-derived identity and usage, and provider provenance. The corrected diff resolved all four. The same reviewer then reported zero actionable findings on both the complete slice and the final lint-driven validator changes.

## Handoff

Implementation and qualification are complete in the canonical checkout. Independent final review reports zero actionable findings; lifecycle completion and generated status projection follow this record.
