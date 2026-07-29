---
architecture_version: 2
id: P0-142
title: Implement storage and conversation fronts
phase: P0.3
status: review
priority: P0
preferred_owner_kind: codex
owner: codex-root
owner_kind: codex
lease_started_at: 2026-07-29T23:05:00+08:00
lease_expires_at: 2026-07-30T23:05:00+08:00
base_sha: e80b33ec370f18c7dfef94c33da71fa63ef631bc
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
- 2026-07-29T23:18:00+08:00 — Implementation started from coordinator-provided
  base `e80b33e`; legacy storage and memory contracts/tests remain read-only
  parity evidence.
- 2026-07-29T23:45:00+08:00 — Implementation and verification completed; task
  moved to review for coordinator integration.

## Handoff

- Commit: task branch HEAD; exact SHA is reported to the coordinator after the
  handoff commit is created.
- Worktree: clean at the reported commit.
- Changed files:
  - new storage feature front under `packages/llm-core/src/features/storage/`
  - new memory feature front under `packages/llm-core/src/features/memory/`
  - qualified AI SDK, LangChain and LlamaIndex storage/conversation adapters
  - storage and memory contract, policy and adapter tests
  - this task file
- Verification:
  - `bun test packages/llm-core/tests/storage packages/llm-core/tests/memory` —
    exit 0; 18 passed, 0 failed.
  - `bun test packages/llm-core/tests` — exit 0; 1,236 passed, 35 skipped, 0
    failed.
  - `bun run typecheck:packages` — exit 0; package typecheck and schema
    freshness passed.
  - `bun run typecheck:tests` — exit 0.
  - focused ESLint over the changed source/test directories — exit 0.
  - `git diff --check` — exit 0.
- ADRs applied: ADR-001, ADR-002, ADR-003, ADR-006, ADR-007 and ADR-008; no
  deviations.
- Projection behavior: only native strings or wholly text/reasoning multipart
  arrays become portable turns. Mixed or binary-only native content is omitted
  and emits an index-only projection issue; provider metadata is never copied.
- Remaining risks: portable conversation records intentionally lose
  provider-only metadata and unsupported multipart turns. Their revision tracks
  the native message count, so it may exceed the projected portable turn count.
  Live resource bytes require host-provided `ResourceStore` implementations.
- Shared-file requests:
  - P0-149 should bind the new storage and memory public fronts.
  - P0-150 should export the selected public fronts and remove legacy
    adapter-owned storage/memory contracts only after call sites have migrated.
