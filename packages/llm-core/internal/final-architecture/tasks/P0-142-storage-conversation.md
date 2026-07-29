---
architecture_version: 2
id: P0-142
title: Implement storage and conversation fronts
phase: P0.3
status: claimed
priority: P0
preferred_owner_kind: codex
owner: codex-root
owner_kind: codex
lease_started_at: 2026-07-29T23:05:00+08:00
lease_expires_at: 2026-07-30T23:05:00+08:00
base_sha: ab397fc
branch: task/P0-142-codex
worktree: /Users/jasonnathan/Repos/@theGeekist/llm-core/.worktrees/P0-142-codex
depends_on:
  - P0-100
  - P0-120
  - P0-130
  - P0-160
decision_dependencies:
  - ADR-001
  - ADR-002
  - ADR-003
  - ADR-006
  - ADR-007
  - ADR-008
conflicts_with: []
write_scope:
  - packages/llm-core/src/features/storage/**
  - packages/llm-core/src/features/memory/**
  - packages/llm-core/src/adapters/providers/ai-sdk/storage/**
  - packages/llm-core/src/adapters/frameworks/langchain/storage/**
  - packages/llm-core/src/adapters/frameworks/llamaindex/storage/**
  - packages/llm-core/tests/storage/**
  - packages/llm-core/tests/memory/**
  - packages/llm-core/internal/final-architecture/tasks/P0-142-storage-conversation.md
review_owner: coordinator
updated_at: 2026-07-29
---

# P0-142 — Storage and Conversation

## Objective

Replace adapter-owned storage, cache, memory and thread contracts with neutral
live ports and portable conversation records.

## Acceptance criteria

- Storage owns resource, key-value and cache live ports.
- Memory owns `ConversationStore`, `ConversationRecord` and
  `ConversationTurn`, using canonical conversation identity and model content.
- Portable records contain no bytes, paths, signed URLs, raw credentials or
  unconstrained values.
- `Uint8Array` access is explicitly live and `MaybePromise` is preserved.
- New qualified adapters depend only on feature public fronts.

## Verification

```sh
bun test packages/llm-core/tests/storage packages/llm-core/tests/memory
bun run typecheck:packages
```

## Work log

- 2026-07-29T23:05:00+08:00 — Claimed for Codex subagent execution.

## Handoff
