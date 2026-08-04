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
  initially OpenSpec to PydanticAI, with exact/degraded/rejected accounting for
  every relevant typed kind.
- Require each other import adapter to prove either typed promotion or an
  explicit document-only boundary with named semantic loss.
- Remove weak ad hoc graph casts where exported contract types can make drift a
  compile-time failure.

## Out of scope

- Claiming lossless conversion or native checkpoint/session interchangeability.
- Publishing adapter fronts.
- Making one external format the canonical model.

## Acceptance criteria

- No adapter may claim typed semantic conformance solely because its generic
  document graph passes `loadSpecification`.
- Cross-adapter tests use production importer output and production projector
  output, not parallel fixtures that encode the same private convention.
- Every conversion loss is bound to a source location or canonical node.
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
