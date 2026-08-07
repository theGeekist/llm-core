---
architecture_version: 2
id: runtime-operation-contract-correction
title: Replace projected runtime support with exact operations
stage: adapters
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
  - capabilities-runtime-conformance
decision_dependencies:
  - ADR-017
conflicts_with:
  - adapter-langgraph-runtime
  - adapter-pydantic-ai-runtime
  - adapter-strands-runtime
  - runtime-adapter-substitution
write_scope:
  - packages/llm-core/src/adapters/runtimes/**
  - packages/llm-core/tests/conformance/**
  - docs/adapters/runtime-conformance.md
  - docs/guide/agent.md
  - docs/guide/workflow.md
  - docs/orchestration/workflows.md
  - docs/reference/conformance.md
  - packages/llm-core/docs/final-architecture/tasks/runtime-operation-contract-correction.md
required_reading:
  - path: packages/llm-core/docs/final-architecture/EXTERNAL-CONTRACT-FIDELITY-IMPACT.md
    reason: "Apply the runtime operation inventory and replace projected support with exact operations."
  - path: docs/adapters/runtime-conformance.md
    reason: "Reconcile the existing conformance evidence with the corrected operation matrix."
read_scope:
  - packages/llm-core/docs/final-architecture/EXTERNAL-CONTRACT-FIDELITY-IMPACT.md
  - docs/adapters/runtime-conformance.md
  - packages/llm-core/src/features/agent/**
  - packages/llm-core/src/features/state/**
  - packages/llm-core/src/features/control/**
  - packages/llm-core/src/features/evidence/**
review_owner: human
updated_at: 2026-08-07
---

# runtime-operation-contract-correction — Replace projected runtime support with exact operations

## Objective

Replace projected runtime compatibility claims with exact operation support and
native runtime ownership.

## In scope

- Remove `projected` from `RuntimeSemanticDisposition`.
- Split normalized portable operations from native runtime operations instead
  of treating normalization as support for the native contract.
- Correct the existing PydanticAI compatibility declaration and conformance
  fixtures.
- Establish the exact operation-matrix form inherited by later LangGraph,
  PydanticAI, Strands and Temporal integration tasks, using the closed
  `supported`, `unsupported` and `not-applicable` dispositions.
- Replace runtime and workflow adoption guidance that currently recommends
  projected, degraded or semantic-loss support declarations.

## Out of scope

- Making checkpoints or sessions interchangeable between runtimes.
- Moving native runtime state into kernel contracts.
- Implementing the future published runtime adapters.

## Acceptance criteria

- Every supported operation has one exact semantic contract and executable
  fixture set.
- Native events, sessions, checkpoints and provider state retain native
  identity and ownership.
- Unsupported native operations are not represented as projected support.
- `not-applicable` is used only with exact-version source evidence that the
  runtime contract does not define the operation or semantic dimension.
- Later runtime tasks inherit the corrected matrix and contain no loss-based
  support criteria.
- Runtime, agent, workflow and conformance pages describe exact portable and
  native operations without presenting conversion loss as supported behaviour.

## Verification

```sh
bun test packages/llm-core/tests/conformance
bun run --cwd packages/llm-core typecheck
bun run --cwd packages/llm-core release:build
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
