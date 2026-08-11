---
architecture_version: 2
id: adapter-langgraph-runtime
title: Qualify the LangGraph runtime integration
stage: adapters
status: proposed
priority: high
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
  - architecture-runtime-ownership-correction
  - runtime-operation-contract-correction
  - architecture-release-reproducibility
  - capabilities-runtime-conformance
  - capabilities-operational-evidence
decision_dependencies:
  - ADR-006
  - ADR-007
  - ADR-016
  - ADR-017
conflicts_with:
  - adapter-catalogue-public-qualification
  - adapter-pydantic-ai-runtime
  - adapter-strands-runtime
write_scope:
  - bun.lock
  - packages/llm-core/src/adapters/langgraph-runtime/**
  - packages/llm-core/tests/adapters/langgraph-runtime/**
  - apps/langgraph-runtime-qualification/**
  - docs/adapters/langgraph-runtime.md
  - packages/llm-core/docs/final-architecture/tasks/adapter-langgraph-runtime.md
required_reading:
  - path: context/aifsd-research/profiles/langgraph.md
    reason: "Use the researched graph, reducer, interrupt and checkpoint semantics as contextual evidence."
  - path: docs/adapters/runtime-conformance.md
    reason: "Preserve exact portable conformance without flattening native graph state."
read_scope:
  - context/aifsd-research/profiles/langgraph.md
  - docs/adapters/runtime-conformance.md
review_owner: coordinator
updated_at: 2026-08-04
---

# adapter-langgraph-runtime — Qualify the LangGraph runtime integration

## Objective

Implement and qualify an exact-version LangGraph TypeScript adapter as an
`AgentRunner` without flattening native graph, reducer, interrupt, checkpoint or
thread semantics.

## In scope

- Pin one LangGraph TypeScript version in an isolated qualification app.
- Implement the `AgentRunner` projection and explicit capability metadata.
- Exercise graph state, reducers, interrupts, checkpoints, threads,
  cancellation and evidence through bounded fixtures.

## Out of scope

- Reimplementing LangGraph orchestration in the kernel.
- Treating native checkpoints or state as portable contracts.
- Supporting versions not covered by exact qualification evidence.

## Acceptance criteria

- The adapter passes the declared runner conformance level in an isolated
  exact-version fixture.
- Native state remains opaque and compatibility metadata is explicit.
- Every supported portable operation has deterministic events, controls and
  evidence; unsupported native operations remain explicit.
- No local-runner fallback exists.

## Verification

```sh
bun test apps/langgraph-runtime-qualification packages/llm-core/tests/adapters/langgraph-runtime
bun run --cwd packages/llm-core release:build
bun run docs:check
bun run check:sloc
```

## Work log

Not started; the pinned version and claim metadata are added on assignment.

## Handoff

Pending execution. Record the exact dependency closure, conformance level,
changed files, native contracts retained, supported and unsupported operation
matrix and command results.
