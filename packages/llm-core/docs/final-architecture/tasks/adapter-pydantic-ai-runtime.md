---
id: adapter-pydantic-ai-runtime
title: Qualify the PydanticAI runtime integration
stage: adapters
status: proposed
priority: high
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
  - adapter-langgraph-runtime
  - adapter-strands-runtime
write_scope:
  - bun.lock
  - packages/llm-core/src/adapters/pydantic-ai-runtime/**
  - packages/llm-core/tests/adapters/pydantic-ai-runtime/**
  - apps/pydantic-ai-runtime-qualification/**
  - docs/adapters/pydantic-ai-runtime.md
  - packages/llm-core/docs/final-architecture/tasks/adapter-pydantic-ai-runtime.md
required_reading:
  - path: context/aifsd-research/profiles/pydantic-ai.md
    reason: "Use the researched Python runtime and version boundary as contextual evidence."
  - path: packages/llm-core/docs/internal/REUSABLE-ABSTRACTION-REVIEW.md
    reason: "Apply the A06 stdio lifecycle caveat before reusing the existing transport."
read_scope:
  - context/aifsd-research/profiles/pydantic-ai.md
  - packages/llm-core/docs/internal/REUSABLE-ABSTRACTION-REVIEW.md
review_owner: coordinator
updated_at: 2026-08-04
---

# adapter-pydantic-ai-runtime — Qualify the PydanticAI runtime integration

## Objective

Implement and qualify an exact-version PydanticAI runtime adapter across an
explicit subprocess, sidecar or remote boundary, distinct from the existing
PydanticAI specification adapter.

## In scope

- Select and pin one PydanticAI version and one explicit operating boundary.
- Implement transport, lifecycle and `AgentRunner` projection for that boundary.
- Qualify messages, usage, state references, cancellation, failures and
  evidence through isolated fixtures.

## Out of scope

- Extending the existing specification adapter into an executor.
- Embedding a Python runtime or agent loop in the kernel.
- Claiming portability for native PydanticAI state or unqualified versions.

## Acceptance criteria

- Transport, process ownership, cancellation and failure semantics are explicit.
- Native PydanticAI messages, usage and state remain native references unless
  an exact portable operation is separately proved.
- The adapter passes the same declared runner conformance level as the first
  TypeScript runtime adapter.
- No local-runner fallback exists.

## Verification

```sh
bun test apps/pydantic-ai-runtime-qualification packages/llm-core/tests/adapters/pydantic-ai-runtime
bun run --cwd packages/llm-core release:build
bun run docs:check
bun run check:sloc
```

The claimed task must add the exact Python-side qualification command for its
selected subprocess, sidecar or remote boundary.

## Work log

Not started; the operating boundary, pinned version and claim metadata are
added on assignment.

## Handoff

Pending execution. Record the dependency closure, transport and lifecycle
contract, conformance level, changed files, supported and unsupported operation
matrix and command results.
