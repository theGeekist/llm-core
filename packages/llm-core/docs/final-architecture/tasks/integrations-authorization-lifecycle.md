---
architecture_version: 2
id: integrations-authorization-lifecycle
title: Connector authorization and secret-reference lifecycle
stage: integrations
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
  - architecture-source-layout-normalization
  - integrations-connector-contracts
decision_dependencies:
  - ADR-004
  - ADR-005
  - ADR-014
  - ADR-015
conflicts_with:
write_scope:
  - packages/llm-core/src/features/integrations/**
  - packages/llm-core/src/application/integrations/**
  - packages/llm-core/tests/integrations/**
  - docs/capabilities/integrations.md
  - packages/llm-core/docs/final-architecture/tasks/integrations-authorization-lifecycle.md
read_scope:
  - packages/llm-core/src/contracts/**
  - packages/llm-core/src/features/control/**
  - packages/llm-core/src/features/evidence/**
review_owner: coordinator
updated_at: 2026-08-02
---

# integrations-authorization-lifecycle — Connector authorization and secret-reference lifecycle

## Objective

Make connector consent, grant state and revocation portable while keeping all
credential values inside host and platform-owned secret infrastructure.

## In scope

- Opaque connection and authorization-grant references and explicit grant
  states for pending, active, refresh-required, expired, revoked and failed.
- Coordinator ports for scope/audience/resource binding, consent, PKCE/state,
  callback completion, refresh, rotation, reauthorization and revocation.
- Evidence and diagnostics for authorization transitions using redacted
  projections only.
- Platform-neutral contracts for desktop, mobile, service and CLI callback and
  secure-storage adapters.

## Out of scope

- A secret manager, raw token serialization, automatic user consent, a
  browser/UI framework, or treating an active grant as policy approval.

## Acceptance criteria

- Portable requests, events, checkpoints and app synchronization contain only
  opaque references and safe metadata.
- Scope or audience mismatch fails before connector invocation.
- Refresh races, revocation and callback replay have deterministic outcomes
  and evidence.
- Authorization never bypasses the ADR-005 action control path.

## Verification

```sh
bun test packages/llm-core/tests/integrations
bun run typecheck:packages
bun run typecheck:tests
bun run lint
bun run --cwd packages/llm-core release:build
bun run test:package
bun run docs:check
bun run --cwd packages/llm-core format:check
```

## Work log

Planned from ADR-014; not claimed.

## Handoff

Pending.
