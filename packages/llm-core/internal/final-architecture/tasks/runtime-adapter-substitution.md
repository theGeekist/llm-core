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
  - packages/llm-core/internal/final-architecture/tasks/runtime-adapter-substitution.md
review_owner: human
updated_at: 2026-08-04
---

# runtime-adapter-substitution — Demonstrate substitution across unlike runtimes

## Objective

Run one portable intent through qualified LangGraph and PydanticAI integrations
and compare portable outcomes, controls, evidence and declared semantic loss.

## Acceptance criteria

- The demonstration changes only the explicit adapter construction.
- Native sessions and checkpoints are not exchanged or described as portable.
- Differences are reported as capabilities and loss rather than normalized
  away.
- The local runner is absent from the demonstration.

## Verification

Defined by the two accepted runtime qualification fixtures.
