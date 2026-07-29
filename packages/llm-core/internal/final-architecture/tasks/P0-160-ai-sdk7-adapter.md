---
architecture_version: 2
id: P0-160
title: Convert AI SDK adapter to version 7
phase: P0.4
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
  - P0-110
  - P0-120
  - P0-155
decision_dependencies:
  - ADR-004
  - ADR-005
  - ADR-007
conflicts_with: []
write_scope:
  - packages/llm-core/src/adapters/providers/ai-sdk/**
  - packages/llm-core/tests/adapters/ai-sdk7/**
  - packages/llm-core/internal/final-architecture/tasks/P0-160-ai-sdk7-adapter.md
read_scope:
  - packages/llm-core/src/features/**
  - packages/llm-core/src/adapters/ai-sdk/**
  - packages/llm-core/tests/adapters/ai-sdk*
review_owner: coordinator
updated_at: 2026-07-29
---

# P0-160 — Convert AI SDK Adapter to Version 7

## Objective

Implement the AI SDK 7 provider adapter behind frozen model, tool and event
contracts without widening the portable API.

## In scope

Current provider contract, multipart streams, structured output, tool approval,
cancellation, warnings, usage and native metadata.

## Out of scope

Package metadata, UI projections, root exports and old adapter deletion.

## Acceptance criteria

- Contract tests cover normal and partial/failure streams.
- Native data survives under extensions.
- Tool approval and cancellation map without bypassing core control.
- Known semantic loss and supported AI SDK version are recorded.

## Verification

```sh
bun test packages/llm-core/tests/adapters/ai-sdk7
bun run typecheck:packages
```

## Work log

## Handoff
