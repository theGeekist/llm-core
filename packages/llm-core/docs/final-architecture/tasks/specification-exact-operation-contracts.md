---
id: specification-exact-operation-contracts
title: Replace specification conversion fidelity with exact operations
stage: specifications
status: done
priority: critical
depends_on:
  - architecture-external-contract-fidelity
  - specification-api
decision_dependencies:
  - ADR-017
conflicts_with: []
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
updated_at: 2026-08-10
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

Execution mode: shared-checkout
Execution rationale: The specification implementation and documentation paths are disjoint from concurrent release/provenance and AI SDK correction work after explicit repartitioning.
Concurrency evaluation: llm-core/release-history-provenance and llm-core/adapter-ai-sdk-native-contract-correction; start alongside; the coordinator retained all manifests, lockfiles, release/provenance files, changelogs and `packages/llm-core/scripts/smoke-package.mjs`, while this task retained specification-owned source, tests and documents.
Concurrent task scopes: llm-core/release-history-provenance owns release tooling, manifests, lockfiles, changelogs and packed-smoke integration; llm-core/adapter-ai-sdk-native-contract-correction owns the AI SDK adapter and model-native surface; this task owns the specification contracts, five specification adapters, compiler paths, focused tests and specification documentation.
Swarm delegation: codex-root -> codex/implement-spec-contracts: implement the exact specification operation contract; task-owned source, tests and documentation, with shared smoke and manifest changes returned as integration requests.

2026-08-10: Replaced `ConversionFidelity`, conversion issue dispositions,
`ConversionReport` and `SpecificationGraph.report` with exact operation
declarations. Operations now bind a recognised source contract and immutable
revision, use only `supported`, `unsupported` or `not-applicable`, and keep
advisory/blocking diagnostics separate from support.

2026-08-10: Corrected OpenSpec, AI-SDLC, BMAD, Spec Kit and PydanticAI
specification surfaces. Native observations retain immutable source snapshots;
portable derivations reject blocking or unrepresentable requested semantics;
supported operations bind exact fixture digests. Compiler review now owns only
graph-resolution diagnostics rather than adapter conversion loss.

2026-08-10: The complete task-owned suite passed with 105 tests, two
intentional environment-dependent skips and 508 assertions across 15 files.
Focused ESLint, package formatting, the VitePress production build and
`git diff --check` also passed. The package typecheck and complete
`release:build` passed after the concurrent AI SDK task corrected its owned
surface; the build ran 718 passing tests, four intentional skips and 2,543
assertions across 98 files.
`docs:check` verifies all published and engineering pages and sidebar links,
then is externally blocked in the concurrent AI SDK snippet by
`docs/snippets/v2/qualified-adapters.ts(20,3): error TS2353: Object literal may only specify known properties, and 'redactProviderMetadata' does not exist in type 'CreateAiSdk7ModelInput'.`
The same line also reports
`docs/snippets/v2/qualified-adapters.ts(20,28): error TS7006: Parameter 'metadata' implicitly has an 'any' type.`
The coordinator-owned `test:package` check was launched, produced no output
after `node scripts/smoke-package.mjs` for two minutes and was interrupted
rather than holding the shared agent slot. Shared packed-smoke integration
remains coordinator-owned and is recorded below.

2026-08-10: Receiving review found four exactness gaps. The correction makes
`SpecificationAdapterSupport.operations` a closed, canonically ordered tuple
covering all five operation families; requires every nested source contract to
equal the declaration authority, format and revision; binds proposed changes
only to target-format `export-native-source` operations; and forbids
`not-applicable` from representing unavailable change export. PydanticAI now
rejects requested skills, every non-empty model requirement including advisory
requirements, dependency schema and output schema before returning portable
success. Negative tests reproduce missing, duplicate and reordered matrices,
each source-contract mismatch dimension, invalid proposal operation/format/
disposition and each PydanticAI omission.

2026-08-10: After workspace resolution was refreshed, the corrected focused
suite passed with 106 tests, two intentional environment-dependent skips and
520 assertions across 15 files. Package typecheck, focused ESLint, all task-owned
formatting, `docs:check`, the VitePress production build and `git diff --check`
passed. The source-level contract regression suite also passed independently
with six tests and 40 assertions while shared resolution was being repaired.

## Blocker

No specification-owned design or verification blocker remains. ADR-017 is
accepted and all specification-lane self-imports now use `@geekist/llm-core`.
After the concurrent Python and AI SDK corrections were integrated, the full
package `release:build` passed with 724 tests, four intentional exact-authority
skips and no failures. Package formatting and the canonical llm-core release
qualification also pass.

## Handoff

Ready for final lifecycle reconciliation. The coordinator-owned
`packages/llm-core/scripts/smoke-package.mjs` constructs a supported operation
with an immutable source contract and fixture digest, imports the replacement
operation and diagnostic types including `SpecificationOperationMatrix`, and
contains no `ConversionReport`. The isolated packed runtime and declaration
consumer passed as part of the canonical llm-core release qualification.
Package-manifest, build-entry, lockfile and release-provenance changes are not
required by this source contract replacement because the existing
`@geekist/llm-core/specifications` export already publishes the changed front.
