---
id: runtime-adapter-substitution
title: Demonstrate substitution across unlike runtimes
stage: qualification
status: proposed
priority: high
depends_on:
  - architecture-external-contract-fidelity
  - runtime-operation-contract-correction
  - adapter-langgraph-runtime
  - adapter-pydantic-ai-runtime
decision_dependencies:
  - ADR-006
  - ADR-007
  - ADR-016
  - ADR-017
conflicts_with: []
write_scope:
  - apps/runtime-adapter-substitution/**
  - docs/reference/runtime-substitution.md
  - packages/llm-core/docs/final-architecture/tasks/runtime-adapter-substitution.md
required_reading:
  - path: docs/adapters/runtime-conformance.md
    reason: "Compare only the exact portable operation set demonstrated by both runtime fixtures."
  - path: packages/llm-core/docs/final-architecture/EXTERNAL-CONTRACT-FIDELITY-IMPACT.md
    reason: "Do not revive loss-based or projected substitution claims."
read_scope:
  - docs/adapters/runtime-conformance.md
  - packages/llm-core/docs/final-architecture/EXTERNAL-CONTRACT-FIDELITY-IMPACT.md
review_owner: human
updated_at: 2026-08-04
---

# runtime-adapter-substitution — Demonstrate substitution across unlike runtimes

## Objective

Run one portable intent through qualified LangGraph and PydanticAI integrations
and compare only the exact portable operations, controls and evidence supported
by both.

## In scope

- Define one fixed portable intent and expected comparison dimensions.
- Execute it through the accepted LangGraph and PydanticAI qualification
  fixtures by changing only explicit adapter construction.
- Publish deterministic outcome, capability and evidence comparisons for the
  common exact operation set.

## Out of scope

- Exchanging native session, checkpoint or state objects between runtimes.
- Hiding runtime differences behind a lowest-common-denominator facade.
- Introducing another runtime or a kernel-owned fallback.

## Acceptance criteria

- The demonstration changes only the explicit adapter construction.
- Native sessions and checkpoints are not exchanged or described as portable.
- Native differences remain owned by each runtime and are never normalized into
  a false portability claim.
- The local runner is absent from the demonstration.

## Verification

```sh
bun test apps/runtime-adapter-substitution
bun run docs:check
bun run check:sloc
```

## Work log

Not started; accepted adapter evidence and claim metadata are added on
assignment.

## Handoff

Pending execution. Record the fixed intent, adapter-only substitution diff,
comparison artifact, changed files, semantic differences and command results.
