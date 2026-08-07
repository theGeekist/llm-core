---
architecture_version: 2
id: specification-cross-adapter-conformance
title: Prove cross-adapter semantic conformance
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
  - architecture-external-contract-fidelity
  - specification-semantic-reconciliation
  - adapter-pydantic-ai-semantic-projection
  - adapter-openspec
  - adapter-ai-sdlc
  - adapter-spec-kit
  - adapter-bmad
decision_dependencies:
  - ADR-009
  - ADR-010
  - ADR-016
  - ADR-017
conflicts_with: []
write_scope:
  - packages/llm-core/tests/adapters/specification-conformance/**
  - packages/llm-core/tests/adapters/openspec/**
  - packages/llm-core/tests/adapters/pydantic-ai-spec/**
  - packages/llm-core/tests/adapters/ai-sdlc/**
  - packages/llm-core/tests/adapters/spec-kit/**
  - packages/llm-core/tests/adapters/bmad/**
  - packages/llm-core/src/adapters/openspec/**
  - packages/llm-core/src/adapters/pydantic-ai-spec/**
  - packages/llm-core/src/adapters/ai-sdlc/**
  - packages/llm-core/src/adapters/spec-kit/**
  - packages/llm-core/src/adapters/bmad/**
  - docs/reference/specification-adapters.md
  - packages/llm-core/docs/final-architecture/tasks/specification-cross-adapter-conformance.md
required_reading:
  - path: packages/llm-core/docs/final-architecture/SPECIFICATIONS.md
    reason: "Use the prior adapter support model only as historical input to exact cross-adapter proof."
  - path: packages/llm-core/docs/internal/REUSABLE-ABSTRACTION-REVIEW.md
    reason: "Avoid mutually green fixture islands and preserve format-specific capture caveats."
  - path: packages/llm-core/docs/final-architecture/EXTERNAL-CONTRACT-FIDELITY-IMPACT.md
    reason: "Treat this task's loss-based wording as historical and apply the current exact-contract correction."
read_scope:
  - packages/llm-core/docs/final-architecture/SPECIFICATIONS.md
  - packages/llm-core/docs/internal/REUSABLE-ABSTRACTION-REVIEW.md
  - packages/llm-core/docs/final-architecture/EXTERNAL-CONTRACT-FIDELITY-IMPACT.md
review_owner: coordinator
updated_at: 2026-08-04
---

# specification-cross-adapter-conformance — Prove cross-adapter semantic conformance

## Objective

Prove that independently qualified source adapters and target projectors meet
one declared semantic boundary rather than remaining mutually green dialect
islands.

## In scope

- Classify every support claim as syntax, observational source semantics, typed
  semantic mapping, compilation, round trip or lifecycle evidence.
- Preserve the existing pinned native fixture suites as format-specific
  evidence.
- Exercise at least one real `import -> reconcile -> review -> project` path,
  initially OpenSpec to PydanticAI, with separate exact operation claims and
  `supported`, `unsupported` or `not-applicable` dispositions for every
  relevant typed kind.
- Require each other import adapter to prove either exact typed promotion or an
  explicit document-only boundary with unsupported semantic operations.
- Remove weak ad hoc graph casts where exported contract types can make drift a
  compile-time failure.

## Out of scope

- Claiming round trip or native checkpoint/session interchangeability without
  exact executable evidence.
- Publishing adapter fronts.
- Making one external format the canonical model.

## Acceptance criteria

- No adapter may claim typed semantic conformance solely because its generic
  document graph passes `loadSpecification`.
- Cross-adapter tests use production importer output and production projector
  output, not parallel fixtures that encode the same private convention.
- Every unsupported semantic operation is bound to a source location or
  canonical node and cannot return a narrowed success.
- Every operation uses the closed `supported`, `unsupported` or
  `not-applicable` disposition set, and `not-applicable` cites the exact source
  contract and version that omits the operation or semantic dimension.
- Publication tasks can consume this durable evidence without redefining the
  semantic claim.

## Verification

```sh
bun test packages/llm-core/tests/adapters/specification-conformance
bun test packages/llm-core/tests/adapters/openspec packages/llm-core/tests/adapters/pydantic-ai-spec packages/llm-core/tests/adapters/ai-sdlc packages/llm-core/tests/adapters/spec-kit packages/llm-core/tests/adapters/bmad
bun run --cwd packages/llm-core typecheck:tests
bun run check:sloc
```

## Work log

Not started. Runs with future adapter qualification/publication work rather than
as an immediate roadmap priority.

## Handoff

Pending.
