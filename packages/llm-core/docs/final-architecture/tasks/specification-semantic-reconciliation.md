---
id: specification-semantic-reconciliation
title: Define document-to-intent reconciliation
stage: specifications
status: proposed
priority: normal
depends_on:
  - specification-exact-operation-contracts
  - specification-semantic-path-characterization
decision_dependencies:
  - ADR-009
  - ADR-016
  - ADR-017
conflicts_with: []
write_scope:
  - packages/llm-core/src/features/specifications/**
  - packages/llm-core/src/application/specification-compiler/**
  - packages/llm-core/src/specifications/**
  - packages/llm-core/tests/specifications/**
  - packages/llm-core/tests/specification-compiler/**
  - packages/llm-core/docs/final-architecture/SPECIFICATIONS.md
  - packages/llm-core/docs/final-architecture/decisions/**
  - packages/llm-core/docs/final-architecture/tasks/specification-semantic-reconciliation.md
required_reading:
  - path: packages/llm-core/docs/final-architecture/SPECIFICATIONS.md
    reason: "Preserve source ownership, accepted scope and typed semantic-waist authority."
  - path: packages/aifsd/docs/final-architecture/CONFIGURATION.md
    reason: "Separate portable intent from integration and runtime configuration sources."
read_scope:
  - packages/llm-core/docs/final-architecture/SPECIFICATIONS.md
  - packages/aifsd/docs/final-architecture/CONFIGURATION.md
review_owner: human
updated_at: 2026-08-04
---

# specification-semantic-reconciliation — Define document-to-intent reconciliation

## Objective

Implement the explicit boundary that reconciles source-owned document graphs
into reviewable typed application intent without treating one native format as
canonical.

## Why this exists

ADR-009 specifies `import -> reconcile -> resolve -> admit -> project`, but the
current public path loads adapter-produced document graphs directly and no
implemented reconciliation stage promotes them into the typed semantic waist.

## In scope

- Decide which semantic values are accepted portable application intent,
  integration compilation configuration or runtime deployment choice.
- Define whether prompt/instructions and model constraints require additional
  typed intent or explicit target bindings.
- Separate observational document support from typed semantic-waist support in
  adapter conformance claims.
- Reconcile native document nodes into typed intent with explicit provenance;
  reject unsupported requested semantics rather than guessing or degrading
  them.
- Require accepted scopes to close over typed semantic references or name an
  explicit external reference contract.
- Validate workflow-step dependency cycles and align readonly portable types
  with runtime immutability.

## Out of scope

- Format-specific PydanticAI projection.
- Publishing existing adapter implementations.
- Replacing native source documents with a universal schema.

## Acceptance criteria

- The characterization fixture crosses reconciliation, review and accepted
  scope without losing source bindings.
- Incomplete referenced scopes and cyclic workflow prerequisites fail with
  structured diagnostics.
- Conformance vocabulary makes document observation and typed semantic mapping
  unambiguous.
- Any new cross-cutting semantic-source decision is captured in a superseding
  ADR before implementation is accepted.

## Verification

```sh
bun test packages/llm-core/tests/specifications packages/llm-core/tests/specification-compiler
bun run --cwd packages/llm-core typecheck:tests
bun run check:sloc
```

## Work log

Not started. Deferred until specification adapter work resumes.

## Handoff

Pending.
