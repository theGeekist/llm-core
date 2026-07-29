---
architecture_version: 2
id: P0-141
title: Implement knowledge retrieval and indexing fronts
phase: P0.3
status: claimed
priority: P0
preferred_owner_kind: codex
owner: codex-root
owner_kind: codex
lease_started_at: 2026-07-29T23:05:00+08:00
lease_expires_at: 2026-07-30T23:05:00+08:00
base_sha: ab397fc
branch: task/P0-141-codex
worktree: /Users/jasonnathan/Repos/@theGeekist/llm-core/.worktrees/P0-141-codex
depends_on:
  - P0-100
  - P0-120
  - P0-160
decision_dependencies:
  - ADR-001
  - ADR-002
  - ADR-003
  - ADR-004
  - ADR-007
  - ADR-008
conflicts_with: []
write_scope:
  - packages/llm-core/src/features/retrieval/**
  - packages/llm-core/src/features/indexing/**
  - packages/llm-core/src/adapters/providers/ai-sdk/retrieval/**
  - packages/llm-core/src/adapters/frameworks/langchain/retrieval/**
  - packages/llm-core/src/adapters/frameworks/llamaindex/retrieval/**
  - packages/llm-core/tests/retrieval/**
  - packages/llm-core/tests/indexing/**
  - packages/llm-core/internal/final-architecture/tasks/P0-141-knowledge-indexing.md
review_owner: coordinator
updated_at: 2026-07-29
---

# P0-141 — Knowledge Retrieval and Indexing

## Objective

Replace adapter-owned document, retrieval, embedding, query and indexing
contracts with neutral feature fronts while preserving current parity evidence.

## Acceptance criteria

- Retrieval owns document loading, splitting, embedding, retrieval, reranking,
  structured query, query engine and response synthesis ports.
- Indexing owns indexing and vector-store ports.
- Portable data uses closed content, `ResourceRef`, `SchemaRef` and `JsonValue`;
  executable/native values remain live adapter inputs.
- `InvocationContext` stays separate and `MaybePromise`/stream behavior survives.
- New qualified adapters depend only on feature public fronts.

## Verification

```sh
bun test packages/llm-core/tests/retrieval packages/llm-core/tests/indexing
bun run typecheck:packages
```

## Work log

- 2026-07-29T23:05:00+08:00 — Claimed for Codex subagent execution.

## Handoff
