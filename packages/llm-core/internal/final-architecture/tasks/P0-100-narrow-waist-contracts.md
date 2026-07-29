---
id: P0-100
title: Implement narrow-waist contracts
phase: P0.1
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
  - A0-001
decision_dependencies:
  - ADR-001
  - ADR-002
  - ADR-003
conflicts_with: []
write_scope:
  - packages/llm-core/src/contracts/**
  - packages/llm-core/tests/contracts/**
  - packages/llm-core/internal/final-architecture/tasks/P0-100-narrow-waist-contracts.md
review_owner: coordinator
updated_at: 2026-07-29
---

# P0-100 — Implement Narrow-Waist Contracts

## Objective

Implement dependency-light identity, invocation, versioning, schema,
capability-claim and native-extension contracts with explicit public fronts.

## In scope

- JSON-compatible identity/reference types.
- `InvocationContext` without framework imports.
- Schema/version and extension conventions.
- Contract round-trip and unknown-extension tests.

## Out of scope

Feature contracts, root exports, provider factories and repository-wide
call-site migration.

## Acceptance criteria

- `src/contracts` imports only internal pure utilities when unavoidable.
- JSON fixtures round-trip and preserve namespaced extensions.
- Live/non-serializable values are excluded explicitly.
- Secret values cannot be placed in the portable context contract.

## Verification

```sh
bun test packages/llm-core/tests/contracts
bun run typecheck:packages
```

## Work log

## Handoff
