---
architecture_version: 2
id: P0-160
title: Convert AI SDK adapter to version 7
phase: P0.4
status: proposed
priority: P0
preferred_owner_kind: codex
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
  - bun.lock
  - packages/llm-core/package.json
  - packages/llm-core/src/adapters/ai-sdk/**
  - packages/llm-core/src/adapters/ai-sdk-ui/**
  - packages/llm-core/src/adapters/model-selection.ts
  - packages/llm-core/src/adapters/providers/ai-sdk/**
  - packages/llm-core/tests/adapters/**
  - packages/llm-core/tests/adapters/ai-sdk7/**
  - packages/llm-core/tests/integration/**
  - packages/llm-core/tests/interop/**
  - packages/llm-core/internal/final-architecture/tasks/P0-160-ai-sdk7-adapter.md
read_scope:
  - packages/llm-core/src/features/**
review_owner: coordinator
updated_at: 2026-07-29
---

# P0-160 — Convert AI SDK Adapter to Version 7

## Objective

Implement the AI SDK 7 provider adapter behind frozen model, tool and event
contracts without widening the portable API.

## In scope

The active manifest/lock upgrade; current and target AI SDK provider adapters;
AI SDK UI compatibility; direct AI SDK adapter, integration and interoperability
tests; multipart streams; structured output; tool approval; cancellation;
warnings; usage; and native metadata. Development and verification use the
exact AI SDK 7 matrix recorded by P0-155.

## Out of scope

Neutral interaction/session orchestration, non-AI-SDK UI projections, root
exports and final legacy-directory deletion. P0-170 owns the architectural UI
projection migration after this task establishes a green AI SDK 7 compatibility
baseline; P0-150 owns final convergence and deletion.

## Acceptance criteria

- Contract tests cover normal and partial/failure streams.
- Native data survives under extensions.
- Tool approval and cancellation map without bypassing core control.
- Known semantic loss and supported AI SDK version are recorded.
- Manifest placement is explicit for every direct AI SDK package; the direct
  AI 5/React 2 overrides are removed without a global AI SDK 7 override.
- Qualified integrations may retain isolated transitive AI SDK 4/5/6
  generations; tests assert the direct adapter uses the recorded v7 matrix.
- The manifest/lock change, provider conversion and AI SDK UI compatibility
  conversion pass together; no red dependency-only state is integrated.

## Verification

```sh
bun install --frozen-lockfile
bun test packages/llm-core/tests/adapters/ai-sdk7
bun run build
bun run test:package
bun run typecheck:packages
```

## Work log

## Handoff
