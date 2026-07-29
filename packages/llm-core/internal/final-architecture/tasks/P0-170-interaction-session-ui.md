---
architecture_version: 2
id: P0-170
title: Convert interaction sessions and UI projections
phase: P0.4
status: claimed
priority: P0
preferred_owner_kind: codex
owner: codex-root
owner_kind: codex
lease_started_at: 2026-07-29T22:55:00+08:00
lease_expires_at: 2026-07-30T22:55:00+08:00
base_sha: 104e8a8
branch: task/P0-170-codex
worktree: /Users/jasonnathan/Repos/@theGeekist/llm-core/.worktrees/P0-170-codex
depends_on:
  - P0-130
  - P0-140
  - P0-160
decision_dependencies:
  - ADR-002
  - ADR-005
  - ADR-006
conflicts_with: []
write_scope:
  - packages/llm-core/src/application/interaction/**
  - packages/llm-core/src/adapters/ui/**
  - packages/llm-core/tests/application/interaction/**
  - packages/llm-core/tests/adapters/ui/**
  - packages/llm-core/internal/final-architecture/tasks/P0-170-interaction-session-ui.md
review_owner: coordinator
updated_at: 2026-07-29
---

# P0-170 — Convert Interaction Sessions and UI Projections

## Objective

Move conversation/session orchestration and UI event projections onto the new
runner, event and state contracts.

## In scope

Conversation identity, session persistence, live continuation handling,
interaction reducer/projection, assistant-ui, ChatKit and NLUX projections, and
the architectural projection layer above the AI SDK UI compatibility baseline
established by P0-160.

## Out of scope

Durable job scheduling, AI SDK dependency/provider compatibility, package
exports and legacy-directory deletion.

## Acceptance criteria

- Session state never claims durable continuation.
- UI events are projections of canonical execution events.
- Reconnect semantics remain distinct from workflow durability.
- Existing UI behavior is retained by migrated tests.

## Verification

```sh
bun test packages/llm-core/tests/application/interaction packages/llm-core/tests/adapters/ui
bun run typecheck:packages
```

## Work log

- 2026-07-29T22:55:00+08:00 — Claimed by the Codex coordinator after P0-130,
  P0-140 and P0-160 integrated and passed receiving verification.

## Handoff
