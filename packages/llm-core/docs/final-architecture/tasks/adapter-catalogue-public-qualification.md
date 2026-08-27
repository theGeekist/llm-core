---
id: adapter-catalogue-public-qualification
title: Qualify the public adapter catalogue and inert candidate contract
stage: adapters
status: done
priority: critical
depends_on:
  - architecture-external-contract-fidelity
  - architecture-release-reproducibility
decision_dependencies: []
conflicts_with:
  - adapter-langgraph-runtime
  - adapter-pydantic-ai-runtime
  - adapter-strands-runtime
write_scope:
  - package.json
  - bun.lock
  - turbo.json
  - tsconfig.json
  - scripts/sloc-baseline.json
  - scripts/qualify-release.ts
  - scripts/release-qualifiers.json
  - packages/llm-core/package.json
  - packages/llm-core/scripts/build.ts
  - packages/llm-core/tsconfig.build.json
  - packages/llm-core/src/application/capability-bindings/**
  - packages/llm-core/src/composition/capability-bindings/**
  - packages/llm-core/src/adapters/langchain/**
  - packages/llm-core/src/adapters/llamaindex/**
  - packages/llm-core/tests/application/capability-bindings/**
  - packages/llm-core/tests/composition/capability-bindings/**
  - packages/llm-core/tests/adapters/langchain/**
  - packages/llm-core/tests/adapters/llamaindex/**
  - packages/llm-core/tests/architecture/public-exports-characterization.test.ts
  - packages/llm-core/tests/architecture/public-surface-characterization.test.ts
  - packages/llm-core/tests/architecture/source-boundaries.test.ts
  - packages/llm-core/scripts/smoke-package.mjs
  - packages/llm-core/docs/internal/ADAPTER-ESTATE-INVENTORY.md
  - packages/llm-core/docs/final-architecture/tasks/adapter-catalogue-public-qualification.md
  - packages/llm-core/docs/final-architecture/STATUS.md
  - docs/reference/package-exports.md
  - docs/reference/failures.md
  - docs/snippets/v2/capability-bindings.ts
required_reading:
  - path: packages/llm-core/docs/internal/ADAPTER-ESTATE-INVENTORY.md
    reason: Characterise the implemented estate, current public fronts and exact qualification gaps before changing exposure.
  - path: packages/llm-core/src/application/capability-bindings/types.ts
    reason: Separate inert candidate identity and evidence from the existing live-port binding contract.
  - path: packages/llm-core/src/composition/capability-bindings/catalog.ts
    reason: Preserve operation-scoped resolution while moving acquisition after plan acceptance.
  - path: packages/llm-core/tests/retrieval/parity-matrix.test.ts
    reason: Use the existing multi-ecosystem parity evidence as the first public substitution proof.
read_scope:
  - packages/llm-core/**
  - packages/llm-core/docs/internal/ADAPTER-ESTATE-INVENTORY.md
  - packages/llm-core/src/application/capability-bindings/types.ts
  - packages/llm-core/src/composition/capability-bindings/catalog.ts
  - packages/llm-core/tests/retrieval/parity-matrix.test.ts
  - docs/reference/package-exports.md
review_owner: coordinator
updated_at: 2026-08-20
---

# adapter-catalogue-public-qualification: Qualify the public adapter catalogue and inert candidate contract

## Objective

Publish a machine-readable adapter catalogue and a data-only candidate descriptor plus separately invocable acquisition factory contract, then qualify at least one materially overlapping portable capability through two supported ecosystem fronts.

## In scope

- Characterise every implemented adapter by portable capability, exact operation, ecosystem identity, support disposition, qualification evidence and public exposure.
- Replace live-port registration as the only planning input with an inert descriptor that contains no provider client, credential, session, port or acquired resource.
- Keep acquisition factories separate and invocable only after a selected plan has been accepted.
- Decide and implement coherent public LangChain and LlamaIndex fronts for the first qualified overlapping capability, using existing parity evidence and exact packed consumers.
- Bind descriptors, factories, package exports, support evidence and archive identity without introducing an AIFSD dependency.

## Out of scope

- Selecting an application profile or defining AIFSD product policy.
- Claiming universal interchangeability across every operation.
- Re-exporting native provider clients as portable values.
- Implementing unrelated proposed runtime adapters.

## Acceptance criteria

- Planning and deterministic candidate resolution operate entirely on immutable data-only descriptors.
- Acquisition does not begin until a selected plan has passed exact identity, support and evidence validation.
- The same portable model, retrieval or storage operation passes through at least two exact, packed and publicly supported ecosystem fronts.
- Unsupported or unqualified operations fail before acquisition.
- The public archive, declarations, catalogue and support evidence agree, with no workspace or source fallback.
- AIFSD is not imported by llm-core and does not own the descriptor vocabulary.

## Verification

```sh
bun run release:qualify:llm-core
bun run docs:check
bun run check:sloc
```

## Work log

Execution mode: shared-checkout
Execution rationale: the canonical checkout is clean and no active task owns an overlapping path.
Concurrency evaluation: aifsd/project-semantic-control-plane-characterization; start alongside; it began after this claim and production/test owners are disjoint, with shared lockfile and SLOC metadata reconciled through frozen install and the canonical aggregate gate.
Concurrent task scopes: aifsd/project-semantic-control-plane-characterization owns apps/aifsd-project-semantics-characterization/**, packages/aifsd/src/project-semantics/**, packages/aifsd/src/integrations/neo4j/**, packages/aifsd/tests/project-semantics/** and their bun.lock/SLOC entries; this task owns llm-core sources, tests, public exports, LangChain/LlamaIndex peer entries and its validation SLOC entry.
Swarm delegation: codex/codex-root -> codex/catalogue_design_audit: contract design review and public-front qualification; packages/llm-core/src/adapters/langchain/**, packages/llm-core/src/adapters/llamaindex/**, package exports and packed-consumer evidence.

- Claim: `codex-root` began implementation from `32dfe690bbb8472224a65ce3bdb43264dff3d46d` with a lease through `2026-08-19T04:36:38+08:00`.
- Scope repair: replaced the non-existent `packages/llm-core/build.ts` path with its actual owner `packages/llm-core/scripts/build.ts` and added the explicit declaration entrypoint owner `packages/llm-core/tsconfig.build.json`.
- Scope repair: added the exact architecture export characterisation test required by the deliberate pre-compatibility catalogue API replacement.
- Scope repair: added the two public documentation owners that referenced the replaced live-binding planning API.
- Scope repair: added the canonical SLOC baseline owner for the permitted `approximately 500 lines` waiver on the 568-line capability validation boundary.
- Scope repair: added the canonical conditional-surface inventory and qualifier registry owners required to classify the dependency-neutral catalogue and register both exact-version ecosystem fronts.
- Scope repair: added the public-surface and source-boundary characterisation owners required to recognise the three deliberate stable subpaths.
- Scope repair: added the root TypeScript path map required for source-level snippet and workspace consumers of the four new public subpaths.
- Implementation: published 67 immutable implementation/export/operation catalogue rows with truthful AI SDK, host, LangChain and LlamaIndex authority, exact implementation identity, public exposure, evidence identity and operation-specific limits.
- Implementation: replaced live-port planning with frozen inert candidates, authentic resolved plans and opaque WeakMap-backed acquisition-factory registrations tied to the exact evidence-verified candidate.
- Implementation: published `./adapters/catalogue`, `./adapters/catalogue/runtime`, `./adapters/langchain` and `./adapters/llamaindex`; the ecosystem fronts expose only the packed-qualified retriever operation.
- Remediation delegation: `codex-root` -> `catalogue_accuracy_fix` owned catalogue truth/matrix remediation; `codex-root` -> `factory_identity_fix` owned opaque factory identity and zero-call regressions.
- Independent review: `independent_catalogue_review` found two P1 defects and one shared-lock P2; both P1s were remediated and its second independent pass reported no actionable issues. The P2 is resolved by the explicit concurrent lock/SLOC ownership record above rather than deleting the AIFSD task's valid state.
- Verification: task-focused matrix passed 80 tests with 1,054 assertions; package lint, source/test type checks, build, documentation checks and diff checks passed.
- Packed evidence: an isolated archive consumer verified all 35 ESM-only exports, declarations, both public catalogue rows, inert resolution, opaque factory registration, exact post-acceptance acquisition and equivalent portable retriever results without workspace or source fallback.
- Archive: `@geekist/llm-core@2.0.0` SHA-256 `5609aadbf42a1c92f989e86232c853e5342a47e2e2798c3cc3079a7062da8eff`.
- Aggregate qualification: llm-core-owned gates are green. The canonical aggregate command must be rerun after concurrent owner `aifsd/project-semantic-control-plane-characterization` resolves the current 545-line `packages/aifsd/src/integrations/neo4j/public.ts` SLOC entry.
- Latency audit: a sandboxed packed install consumed its full 600-second timeout before the required elevated rerun; canonical attempts ran 202.2 seconds and 148.9 seconds before unrelated AIFSD timeout/SLOC failures; a standalone AIFSD packed test took 57.97 seconds and passed; package-wide lint took roughly three minutes after focused lint was already green. The independent contract review also started after these expensive attempts and exposed P1 rework. Future qualification should perform an independent contract review immediately after first compile, remediate in parallel, then run one packed and one canonical gate.

## Handoff

Human review closed this task on 20 August 2026. Public fronts are `./adapters/catalogue`, `./adapters/catalogue/runtime`, `./adapters/langchain` and `./adapters/llamaindex`. The catalogue contains 67 exact operation rows and the packed public support window is `@langchain/core` 1.1.8 plus `@llamaindex/core` 0.6.22 for `Retriever.retrieve` only. Candidate descriptors contain frozen portable identity/evidence data; raw factories remain private behind opaque registrations verified and associated with the exact candidate before acquisition. The final archive digest is `5609aadbf42a1c92f989e86232c853e5342a47e2e2798c3cc3079a7062da8eff` and the isolated consumer verified 35 runtime/declaration fronts plus cross-ecosystem substitution. The final shared canonical release qualification is green. No push, publication or release was performed.
