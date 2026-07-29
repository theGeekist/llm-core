---
architecture_version: 2
id: P0-150
title: Converge P0 and delete old contracts
phase: P0.5
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
  - I0-010
  - P0-140
  - P0-141
  - P0-142
  - P0-143
  - P0-149
  - P0-160
  - P0-170
decision_dependencies:
  - ADR-001
  - ADR-002
  - ADR-003
  - ADR-004
  - ADR-005
  - ADR-006
  - ADR-007
  - ADR-008
conflicts_with: []
write_scope:
  - README.md
  - bun.lock
  - packages/llm-core/index.ts
  - packages/llm-core/package.json
  - packages/llm-core/README.md
  - packages/llm-core/scripts/build.ts
  - packages/llm-core/scripts/smoke-package.mjs
  - packages/llm-core/src/**
  - packages/llm-core/tests/**
  - docs/**
  - examples/**
  - apps/**
  - packages/llm-core/internal/final-architecture/tasks/P0-150-core-convergence.md
review_owner: human
updated_at: 2026-07-29
---

# P0-150 — Converge P0 and Delete Old Contracts

## Objective

Integrate all P0 spokes, update public fronts/call sites and remove the old
adapter-owned domain contracts and vocabulary in one controlled replacement.

## In scope

Shared barrels, imports/exports, workflow/recipe migrations, fixtures, examples,
docs, old directories/types and package smoke coverage.

## Out of scope

P1 context/artifact/evaluation and external framework integrations.

## Acceptance criteria

- No old public names remain outside historical documents.
- No portable domain contract remains adapter-owned.
- Deep-import and dependency-direction checks pass.
- Every new subpath is covered by package smoke tests.
- Root and subpath exports match ADR-008 exactly.
- Published version and lockfile are `2.0.0`.
- Every runtime and declaration target resolves from an isolated packed
  consumer; emitted declarations contain no source-only aliases.
- Full repository verification passes.

## Verification

```sh
bun run lint
bun run build
bun run test:package
bun run typecheck
bun run typecheck:tests
bun run test
bun run typecheck:examples
bun run docs:snippets:typecheck
bun run docs:build
bun run --cwd packages/llm-core check:examples-deps
git diff --check
```

## Work log

## Handoff
