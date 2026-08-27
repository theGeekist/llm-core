---
id: specification-semantic-path-characterization
title: Characterize the specification semantic path
stage: specifications
status: proposed
priority: normal
depends_on:
  - architecture-external-contract-fidelity
  - architecture-runtime-ownership-correction
  - specification-api
  - adapter-openspec
  - adapter-pydantic-ai
  - adapter-ai-sdlc
  - adapter-spec-kit
  - adapter-bmad
decision_dependencies:
  - ADR-009
  - ADR-016
  - ADR-017
conflicts_with: []
write_scope:
  - packages/llm-core/tests/specifications/semantic-path-characterization.test.ts
  - packages/llm-core/tests/specifications/fixtures/**
  - packages/llm-core/docs/final-architecture/tasks/specification-semantic-path-characterization.md
required_reading:
  - path: packages/llm-core/docs/final-architecture/SPECIFICATIONS.md
    reason: "Use the existing semantic path as the characterization subject, not as proof that it composes."
  - path: packages/llm-core/docs/internal/REUSABLE-ABSTRACTION-REVIEW.md
    reason: "Apply fixture-island and observation-capture caveats to the characterization."
read_scope:
  - packages/llm-core/docs/final-architecture/SPECIFICATIONS.md
  - packages/llm-core/docs/internal/REUSABLE-ABSTRACTION-REVIEW.md
  - packages/llm-core/src/features/specifications/**
  - packages/llm-core/src/application/specification-compiler/**
  - packages/llm-core/src/specifications/**
  - packages/llm-core/src/adapters/**
  - packages/llm-core/tests/adapters/**
review_owner: coordinator
updated_at: 2026-08-04
---

# specification-semantic-path-characterization — Characterize the specification semantic path

## Objective

Make the current document, typed-intent and legacy aggregate dialect boundaries
executable and visible before any adapter is rewritten.

## Why this exists

The adapter suites prove native observation, one manually constructed typed
graph, and legacy aggregate PydanticAI projection independently. No fixture
proves that those boundaries compose, so mutually compatible mocks can hide
architectural drift.

## In scope

- Add one canonical typed application fixture containing application, workflow
  intent, agent, tool, context, capability, evaluation and approval nodes.
- Characterize `load -> review -> accepted scope -> project` without changing
  current production behavior.
- Record the current PydanticAI failure against the typed accepted decision.
- Record incomplete semantic-reference scopes and internal workflow-step cycles.
- Classify each existing adapter fixture as native evidence, observational
  document graph, typed semantic intent or legacy aggregate projection.

## Out of scope

- Implementing reconciliation or changing adapter behavior.
- Replacing pinned native fixture bytes.
- Publishing an adapter front.

## Acceptance criteria

- The canonical fixture is typechecked without casting its node collection to
  `never` or an untyped ad hoc graph.
- Characterization distinguishes source observation, portable derivation and
  typed-waist conformance, recording unsupported operations at each boundary.
- Existing native fixture suites remain unchanged and continue to pass.
- The PydanticAI incompatibility is demonstrated through the public review and
  projection path rather than inferred from implementation details.

## Verification

```sh
bun test packages/llm-core/tests/specifications/semantic-path-characterization.test.ts
bun run --cwd packages/llm-core typecheck:tests
```

## Work log

Not started. Added after a read-only fixture and mock audit found three
unconnected specification dialects.

## Handoff

Pending.
