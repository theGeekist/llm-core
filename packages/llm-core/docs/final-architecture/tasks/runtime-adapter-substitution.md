---
architecture_version: 2
id: runtime-adapter-substitution
title: Demonstrate substitution across unlike runtimes
stage: qualification
status: proposed
priority: high
preferred_owner_kind: coordinator
owner:
owner_kind:
lease_started_at:
lease_expires_at:
base_sha:
branch:
worktree:
depends_on:
  - adapter-langgraph-runtime
  - adapter-pydantic-ai-runtime
decision_dependencies:
  - ADR-006
  - ADR-007
  - ADR-016
conflicts_with: []
write_scope:
  - apps/runtime-adapter-substitution/**
  - docs/reference/runtime-substitution.md
  - packages/llm-core/docs/final-architecture/tasks/runtime-adapter-substitution.md
review_owner: human
updated_at: 2026-08-04
---

# runtime-adapter-substitution — Demonstrate substitution across unlike runtimes

## Objective

Run one portable intent through qualified LangGraph and PydanticAI integrations
and compare portable outcomes, controls, evidence and declared semantic loss.

## In scope

- Define one fixed portable intent and expected comparison dimensions.
- Execute it through the accepted LangGraph and PydanticAI qualification
  fixtures by changing only explicit adapter construction.
- Publish deterministic outcome, capability, evidence and loss comparisons.

## Out of scope

- Exchanging native session, checkpoint or state objects between runtimes.
- Hiding runtime differences behind a lowest-common-denominator facade.
- Introducing another runtime or a kernel-owned fallback.

## Acceptance criteria

- The demonstration changes only the explicit adapter construction.
- Native sessions and checkpoints are not exchanged or described as portable.
- Differences are reported as capabilities and loss rather than normalized
  away.
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
