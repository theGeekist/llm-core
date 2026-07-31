---
architecture_version: 2
id: integrations-connector-contracts
title: Connector manifest and lifecycle contracts
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
  - language-rollout
decision_dependencies:
  - ADR-003
  - ADR-005
  - ADR-007
  - ADR-014
conflicts_with:
  - adapters-protocol-qualification
write_scope:
  - packages/llm-core/src/features/integrations/**
  - packages/llm-core/tests/integrations/**
  - docs/capabilities/integrations.md
  - packages/llm-core/internal/final-architecture/tasks/integrations-connector-contracts.md
read_scope:
  - packages/llm-core/src/contracts/**
  - packages/llm-core/src/features/tooling/**
  - packages/llm-core/src/features/control/**
  - packages/llm-core/src/features/evidence/**
  - packages/llm-core/src/application/**
review_owner: coordinator
updated_at: 2026-08-01
---

# integrations-connector-contracts — Connector manifest and lifecycle contracts

## Objective

Define the common connector identity, discovery and lifecycle narrow waist
without flattening MCP, A2A, SaaS actions, authorization or usage providers
into one operation model.

## In scope

- Versioned connector identity, manifest, capability families, configuration
  schema, effect/data classification, health and support/loss declarations.
- Lifecycle ports for discovery, validation, connection health and invocation
  preparation, with protocol-native operations kept behind typed family ports.
- Reliability declarations for idempotency, retries, rate limits, pagination,
  event cursors/deduplication, cancellation and reconciliation.
- Conformance fixtures proving unknown capabilities and unsupported semantics
  fail explicitly.

## Out of scope

- OAuth flows or secret storage, concrete SaaS/MCP/A2A adapters, workflows,
  package publication, a hosted connector catalogue or provider SDK types in
  portable contracts.

## Acceptance criteria

- A connector manifest identifies exact contract and adapter versions and
  cannot claim undeclared operations.
- Tool, resource, remote-agent, authorization and usage-provider families keep
  distinct typed operations and state.
- Every meaningful operation declares effect and idempotency/reconciliation
  posture before execution can be prepared.
- Serialized connector values contain no credential material or native SDK
  object.

## Verification

```sh
bun test packages/llm-core/tests/integrations
bun run typecheck:packages
bun run typecheck:tests
bun run lint
```

## Work log

Planned from ADR-014; not claimed.

## Handoff

Pending.
