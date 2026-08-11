---
architecture_version: 2
id: adapter-catalogue-public-qualification
title: Qualify the public adapter catalogue and inert candidate contract
stage: adapters
status: proposed
priority: critical
preferred_owner_kind: codex
owner:
owner_kind:
lease_started_at:
lease_expires_at:
base_sha:
branch:
worktree:
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
  - packages/llm-core/package.json
  - packages/llm-core/build.ts
  - packages/llm-core/src/application/capability-bindings/**
  - packages/llm-core/src/composition/capability-bindings/**
  - packages/llm-core/src/adapters/langchain/**
  - packages/llm-core/src/adapters/llamaindex/**
  - packages/llm-core/tests/application/capability-bindings/**
  - packages/llm-core/tests/composition/capability-bindings/**
  - packages/llm-core/tests/adapters/langchain/**
  - packages/llm-core/tests/adapters/llamaindex/**
  - packages/llm-core/scripts/smoke-package.mjs
  - packages/llm-core/docs/internal/ADAPTER-ESTATE-INVENTORY.md
  - packages/llm-core/docs/final-architecture/tasks/adapter-catalogue-public-qualification.md
  - packages/llm-core/docs/final-architecture/STATUS.md
  - docs/reference/package-exports.md
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
updated_at: 2026-08-11
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

Not started. The existing estate inventory and parity suites are evidence, not publication proof.

## Handoff

Pending execution. Record the exact public fronts, descriptor and factory contracts, operation matrix, external versions, packed archive digest and isolated consumer results.
