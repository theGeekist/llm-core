---
architecture_version: 2
id: specification-exact-operation-contracts
title: Replace specification conversion fidelity with exact operations
stage: specifications
status: proposed
priority: critical
preferred_owner_kind: coordinator
owner:
owner_kind:
lease_started_at:
lease_expires_at:
base_sha:
branch:
worktree:
depends_on:
  - architecture-external-contract-fidelity
  - specification-api
decision_dependencies:
  - ADR-017
conflicts_with:
  - specification-semantic-path-characterization
  - specification-semantic-reconciliation
  - adapter-pydantic-ai-semantic-projection
  - specification-cross-adapter-conformance
write_scope:
  - packages/llm-core/src/features/specifications/**
  - packages/llm-core/src/specifications/**
  - packages/llm-core/src/application/specification-compiler/**
  - packages/llm-core/src/adapters/openspec/**
  - packages/llm-core/src/adapters/ai-sdlc/**
  - packages/llm-core/src/adapters/bmad/**
  - packages/llm-core/src/adapters/spec-kit/**
  - packages/llm-core/src/adapters/pydantic-ai-spec/**
  - packages/llm-core/tests/specifications/**
  - packages/llm-core/tests/adapters/openspec/**
  - packages/llm-core/tests/adapters/ai-sdlc/**
  - packages/llm-core/tests/adapters/bmad/**
  - packages/llm-core/tests/adapters/spec-kit/**
  - packages/llm-core/tests/adapters/pydantic-ai-spec/**
  - packages/llm-core/tests/specification-compiler/**
  - packages/llm-core/scripts/smoke-package.mjs
  - docs/guide/core-concepts.md
  - docs/reference/api.md
  - docs/reference/migration-2.md
  - docs/reference/package-exports.md
  - packages/llm-core/docs/final-architecture/SPECIFICATIONS.md
  - packages/llm-core/docs/final-architecture/tasks/specification-exact-operation-contracts.md
required_reading:
  - path: packages/llm-core/docs/final-architecture/EXTERNAL-CONTRACT-FIDELITY-IMPACT.md
    reason: "Use the exact module inventory and remove loss-based support contracts."
  - path: packages/llm-core/docs/internal/REUSABLE-ABSTRACTION-REVIEW.md
    reason: "Apply canonicalisation and source-capture caveats before changing adapter operations."
read_scope:
  - packages/llm-core/docs/final-architecture/EXTERNAL-CONTRACT-FIDELITY-IMPACT.md
  - packages/llm-core/docs/internal/REUSABLE-ABSTRACTION-REVIEW.md
  - packages/llm-core/src/contracts/**
  - packages/llm-core/src/application/specification-compiler/**
  - packages/llm-core/tests/specification-compiler/**
review_owner: human
updated_at: 2026-08-07
---

# specification-exact-operation-contracts — Replace specification conversion fidelity with exact operations

## Objective

Replace partial conversion support with exact, separately named specification
operations and explicit unsupported-operation diagnostics.

## In scope

- Remove `ConversionFidelity`, degraded issue dispositions and
  `SpecificationGraph.report` as support-level contracts.
- Define exact source observation, portable derivation, compilation, export and
  round-trip operations with independent `supported`, `unsupported` or
  `not-applicable` dispositions.
- Retain immutable native source snapshots and exact source identity.
- Correct OpenSpec, AI-SDLC, BMAD, Spec Kit and PydanticAI specification
  adapters against the new operation contracts.
- Replace affected public exports, validators and fixtures directly.
- Correct compiler review and resolution paths that consume conversion issues,
  and the packed-package smoke contract that imports `ConversionReport`.
- Update the public specification adoption and export pages to describe the
  exact operations actually retained after the contract replacement.

## Out of scope

- Treating one specification format as canonical.
- Claiming round trip from a portable derivation.
- Compatibility aliases for conversion-fidelity types.

## Acceptance criteria

- Every supported operation names its exact source contract, version and
  executable fixtures.
- Every `not-applicable` operation cites exact source-contract evidence that
  the operation or semantic dimension is absent; missing adapter work remains
  `unsupported`.
- Unrepresentable requested semantics reject before a portable success value is
  returned.
- Native source data remains available independently of portable derivation.
- No public type or adapter result uses exact, partial or rejected as conversion
  support levels.
- Compiler review and resolution use exact operation dispositions without
  reviving rejected conversion fidelity as a separate support scale.
- The packed-package smoke fixture imports and exercises the replacement public
  operation contract rather than `ConversionReport`.
- Public API, package-export, migration and core-concept pages agree with the
  implemented operation names and make no loss-metadata support claim.

## Verification

```sh
bun test packages/llm-core/tests/specifications packages/llm-core/tests/specification-compiler packages/llm-core/tests/adapters/openspec packages/llm-core/tests/adapters/ai-sdlc packages/llm-core/tests/adapters/bmad packages/llm-core/tests/adapters/spec-kit packages/llm-core/tests/adapters/pydantic-ai-spec
bun run --cwd packages/llm-core typecheck
bun run --cwd packages/llm-core release:build
bun run --cwd packages/llm-core test:package
bun run release:qualify:llm-core
bun run docs:check
bun run docs:build
bun run --cwd packages/llm-core format:check
git diff --check
```

## Work log

Not started.

## Blocker

ADR-017 requires human acceptance.

## Handoff

Not started.
