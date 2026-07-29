---
id: I0-010
title: Characterize current public API and migration blast radius
phase: I0
status: ready
priority: P0
preferred_owner_kind: claude-code
owner: null
owner_kind: null
lease_started_at: null
lease_expires_at: null
base_sha: null
branch: null
worktree: null
depends_on: []
decision_dependencies: []
conflicts_with: []
write_scope:
  - packages/llm-core/tests/architecture/**
  - packages/llm-core/internal/final-architecture/tasks/I0-010-characterize-public-api.md
read_scope:
  - packages/llm-core/index.ts
  - packages/llm-core/package.json
  - packages/llm-core/src/**
  - packages/llm-core/tests/**
  - docs/**
review_owner: coordinator
updated_at: 2026-07-29
---

# I0-010 — Characterize Current Public API and Migration Blast Radius

## Objective

Create compile-level characterization fixtures for the current public/subpath
surface and record exact old-name call-site counts before replacements begin.

## In scope

- Root and subpath export compile fixtures.
- Current serialized/live state shape fixtures where feasible.
- Reproducible `rg` counts for the replacement vocabulary.

## Out of scope

New contracts, renames, package changes and behavior modifications.

## Acceptance criteria

- Fixtures fail if an existing public path disappears before its owning task.
- Blast-radius evidence covers naming targets listed in ADR-002.
- No production file or shared test fixture changes.

## Verification

```sh
bun test packages/llm-core/tests/architecture
bun run typecheck:tests
```

## Work log

## Handoff
