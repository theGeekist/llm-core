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
  - architecture-runtime-ownership-correction
  - architecture-release-reproducibility
  - capabilities-runtime-conformance
  - capabilities-operational-evidence
decision_dependencies:
  - ADR-006
  - ADR-007
  - ADR-016
conflicts_with:
  - adapter-pydantic-ai-runtime
  - adapter-strands-runtime
write_scope:
  - bun.lock
  - packages/llm-core/src/adapters/langgraph-runtime/**
  - packages/llm-core/tests/adapters/langgraph-runtime/**
  - apps/langgraph-runtime-qualification/**
  - docs/adapters/langgraph-runtime.md
  - packages/llm-core/internal/final-architecture/tasks/adapter-langgraph-runtime.md
review_owner: coordinator
updated_at: 2026-08-04
---

# adapter-langgraph-runtime — Qualify the LangGraph runtime integration

## Objective

Implement and qualify an exact-version LangGraph TypeScript adapter as an
`AgentRunner` without flattening native graph, reducer, interrupt, checkpoint or
thread semantics.

## Acceptance criteria

- The adapter passes the declared runner conformance level in an isolated
  exact-version fixture.
- Native state remains opaque and compatibility metadata is explicit.
- Portable events, controls, evidence and semantic loss are deterministic.
- No local-runner fallback exists.

## Verification

Defined when the exact upstream version and qualification fixture are selected.
