---
architecture_version: 2
id: applications-client-contract
title: Shared end-user client application contract
stage: applications
status: proposed
priority: high
preferred_owner_kind: codex
owner:
owner_kind:
lease_started_at:
lease_expires_at:
base_sha:
branch:
worktree:
depends_on:
  - specification-api
  - integrations-authorization-lifecycle
  - capabilities-cost-intelligence
decision_dependencies:
  - ADR-001
  - ADR-006
  - ADR-012
  - ADR-014
conflicts_with:
  - applications-desktop
  - applications-mobile
write_scope:
  - packages/llm-client/**
  - docs/applications/**
  - packages/llm-core/internal/final-architecture/tasks/applications-client-contract.md
read_scope:
  - packages/llm-core/src/**/public.ts
  - packages/llm-core/package.json
  - packages/llm-core/tests/**
review_owner: coordinator
updated_at: 2026-08-01
---

# applications-client-contract — Shared end-user client application contract

## Objective

Define the stable client-facing application and synchronization contract that
desktop and mobile can share without importing kernel internals or assuming a
particular UI/native framework.

## In scope

- Account/tenant selection, connection management, run submission/control,
  event cursors, approvals, usage/cost projections, cache state and explicit
  offline/conflict dispositions.
- Local and remote host transports behind the same typed client boundary.
- Redacted, versioned app persistence and migration fixtures.
- Public-package consumption tests and a decision on package/workspace
  placement before publication.

## Out of scope

- UI components, OS credential storage, OAuth browser callbacks,
  notifications, analytics storage, app-store release or deep imports from
  `llm-core` features.

## Acceptance criteria

- The same contract tests pass against local and fake remote hosts.
- Client state distinguishes replayable event data, cache projections and
  non-portable runtime/credential references.
- Offline mutation conflicts fail or reconcile explicitly; they never silently
  duplicate controlled effects.
- Packed-consumer tests prove the client uses only curated public exports.

## Verification

```sh
bun test packages/llm-client
bun run typecheck:packages
bun run lint
```

## Work log

Planned from ADR-014; not claimed.

## Handoff

Pending.
