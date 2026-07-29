---
id: P0-155
title: Resolve AI SDK 7 dependency and module-format gate
phase: P0.4
status: proposed
priority: P0
preferred_owner_kind: coordinator
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
decision_dependencies:
  - ADR-007
conflicts_with: []
write_scope:
  - package.json
  - bun.lock
  - packages/llm-core/package.json
  - packages/llm-core/scripts/build.ts
  - packages/llm-core/internal/final-architecture/tasks/P0-155-ai-sdk7-packaging-gate.md
review_owner: human
updated_at: 2026-07-29
---

# P0-155 — Resolve AI SDK 7 Dependency and Module-Format Gate

## Objective

Apply the accepted runtime/module-format decision and establish a buildable
dependency baseline for the isolated AI SDK 7 conversion.

## In scope

Package metadata, lockfile, build-entry implications and the adapter isolation
boundary approved by ADR-007.

## Out of scope

AI SDK adapter implementation and unrelated dependency upgrades.

## Acceptance criteria

- Core module-format promise remains explicit.
- AI SDK 7 dependencies are isolated as decided.
- Existing non-AI-SDK package smoke paths still build.
- P0-160 has a stable dependency baseline.

## Verification

```sh
bun run build
bun run test:package
bun run typecheck:packages
```

## Work log

## Handoff
