---
id: P0-120
title: Implement model and profile vertical slice
phase: P0.2
status: proposed
priority: P0
preferred_owner_kind: claude-code
owner: null
owner_kind: null
lease_started_at: null
lease_expires_at: null
base_sha: null
branch: null
worktree: null
depends_on:
  - P0-100
decision_dependencies:
  - ADR-002
  - ADR-003
  - ADR-004
conflicts_with: []
write_scope:
  - packages/llm-core/src/features/model/**
  - packages/llm-core/tests/model/**
  - packages/llm-core/internal/final-architecture/tasks/P0-120-model-profile-vertical-slice.md
review_owner: coordinator
updated_at: 2026-07-29
---

# P0-120 — Implement Model and Profile Vertical Slice

## Objective

Implement neutral model request/response, provider/deployment references,
evidence-backed model profiles and registry-driven resolution using the builtin
model as the first executable path.

## In scope

`ModelRequest`, `ModelResponse`, provider metadata, model/profile references,
capability requirements/claims, resolver port and builtin model tests.

## Out of scope

AI SDK 7, LangChain/LlamaIndex migration, ambient credential lookup, root
exports and deletion of old adapter-owned model types.

## Acceptance criteria

- Multipart content, structured output, reasoning, tool lifecycle, usage,
  warnings, finish/error and extensions are representable.
- Resolution never reads environment credentials.
- Capability claims cite conformance provenance.
- Builtin model passes focused contract tests.

## Verification

```sh
bun test packages/llm-core/tests/model
bun run typecheck:packages
```

## Work log

## Handoff
