---
architecture_version: 2
id: adapters-protocol-qualification
title: MCP and A2A qualification boundary
stage: adapters
status: proposed
priority: medium
preferred_owner_kind: codex
owner:
owner_kind:
lease_started_at:
lease_expires_at:
base_sha:
branch:
worktree:
depends_on:
  - runtime-receipt-reconciliation
  - capabilities-operational-evidence
  - integrations-authorization-lifecycle
decision_dependencies:
  - ADR-005
  - ADR-006
  - ADR-007
  - ADR-013
  - ADR-014
conflicts_with:
  - runtime-temporal-reference
  - adapter-strands-runtime-release
write_scope:
  - packages/llm-core/src/adapters/protocols/**
  - packages/llm-core/tests/adapters/protocols/**
  - docs/adapters/index.md
  - docs/adapters/runtime-conformance.md
  - packages/llm-core/internal/final-architecture/tasks/adapters-protocol-qualification.md
read_scope:
  - packages/llm-core/src/contracts/**
  - packages/llm-core/src/features/tooling/**
  - packages/llm-core/src/features/control/**
  - packages/llm-core/src/features/evidence/**
  - packages/llm-core/src/application/**
review_owner: coordinator
updated_at: 2026-08-01
---

# adapters-protocol-qualification — MCP and A2A qualification boundary

## Objective

Characterize MCP tools/resources and A2A peers behind the existing control,
identity, evidence and state boundaries before any public protocol adapter is
claimed.

## In scope

- Version-pinned support matrices, threat and loss models, and conformance
  fixtures for MCP tool/resource translation and A2A remote-agent invocation.
- MCP tool calls entering the normal schema, policy, approval, receipt and
  cancellation path.
- A2A remote identity, delegation, events, session/checkpoint and failure
  mappings that preserve unsupported semantics as native extensions or reject
  them explicitly.

## Out of scope

- Treating an MCP server or A2A peer as trusted authorization, publishing an
  adapter subpath, remote-agent checkpoint portability, or a generic team API.

## Acceptance criteria

- Protocol metadata cannot bypass action digest, policy or approval checks.
- A2A state and delegation retain their remote/native owner unless an exact
  portable mapping is tested.
- Every supported operation, version and loss is declared before a separate
  publication task may add a package export.

## Verification

```sh
bun test packages/llm-core/tests/adapters/protocols
bun run typecheck:packages
bun run typecheck:tests
bun run lint
```

## Work log

Planned from ADR-013 and hardened by ADR-014; not claimed.

## Handoff

Pending.
