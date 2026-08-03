---
architecture_version: 2
id: adapter-pydantic-ai-runtime
title: Qualify the PydanticAI runtime integration
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
  - adapter-langgraph-runtime
  - adapter-strands-runtime
write_scope:
  - bun.lock
  - packages/llm-core/src/adapters/pydantic-ai-runtime/**
  - packages/llm-core/tests/adapters/pydantic-ai-runtime/**
  - apps/pydantic-ai-runtime-qualification/**
  - docs/adapters/pydantic-ai-runtime.md
  - packages/llm-core/internal/final-architecture/tasks/adapter-pydantic-ai-runtime.md
review_owner: coordinator
updated_at: 2026-08-04
---

# adapter-pydantic-ai-runtime — Qualify the PydanticAI runtime integration

## Objective

Implement and qualify an exact-version PydanticAI runtime adapter across an
explicit subprocess, sidecar or remote boundary, distinct from the existing
PydanticAI specification adapter.

## Acceptance criteria

- Transport, process ownership, cancellation and failure semantics are explicit.
- Native PydanticAI messages, usage and state remain native references where
  portable projection would lose meaning.
- The adapter passes the same declared runner conformance level as the first
  TypeScript runtime adapter.
- No local-runner fallback exists.

## Verification

Defined when the operating boundary and exact upstream version are selected.
