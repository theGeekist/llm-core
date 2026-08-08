---
architecture_version: 2
id: integrations-connector-characterization
title: Characterize unlike connector vertical slices
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
  - architecture-external-contract-fidelity
  - architecture-source-layout-normalization
  - language-rollout
  - adapters-protocol-qualification
decision_dependencies:
  - ADR-003
  - ADR-005
  - ADR-007
  - ADR-014
  - ADR-015
  - ADR-017
conflicts_with:
write_scope:
  - packages/llm-core/tests/integrations/characterization/**
  - packages/llm-core/docs/final-architecture/tasks/integrations-connector-characterization.md
required_reading:
  - path: context/simple-chat/README.md
    reason: "Keep scaffold-only status explicit so planned MCP behaviour is not cited as executable qualification."
  - path: context/simple-chat/docs/protocols/mcp-adapter.md
    reason: "Use planned MCP lifecycle and delivery distinctions as contextual evidence, not a generic connector contract."
  - path: context/simple-chat/docs/adr/0001-a2a-canonical-protocol.md
    reason: "Keep A2A identity and delegation outside the connector abstraction."
read_scope:
  - context/simple-chat/README.md
  - context/simple-chat/docs/protocols/mcp-adapter.md
  - context/simple-chat/docs/adr/0001-a2a-canonical-protocol.md
  - packages/llm-core/src/contracts/**
  - packages/llm-core/src/features/tooling/**
  - packages/llm-core/src/tools/**
  - packages/llm-core/src/features/control/**
  - packages/llm-core/src/features/evidence/**
review_owner: coordinator
updated_at: 2026-08-08
---

# integrations-connector-characterization — Characterize unlike connector vertical slices

## Objective

Prove common and non-common connector semantics with two unlike private
vertical slices before freezing a shared connector contract.

## In scope

- An executable MCP tool/resource discovery and controlled-invocation slice
  consuming the qualified public MCP surface with task-local application ports
  and state.
- An independently implemented executable OAuth-backed SaaS slice covering
  consent references, pagination, rate limits and webhook or polling
  reconciliation with its own task-local ports and state.
- A field-by-field commonality, unsupported-operation and reliability report.

## Out of scope

- Public connector types, production credentials, provider publication or A2A
  delegation.

## Acceptance criteria

- Both slices enter meaningful effects through the existing control path.
- Both slices execute discovery, preparation, invocation, failure and
  reconciliation journeys; static fixture comparison alone cannot satisfy
  characterization.
- Neither slice imports a shared connector abstraction or shared task-local
  connector base. Similarity is derived only after both executable slices work.
- Portable fixtures contain no credential values or SDK-native objects.
- The report traces every proposed shared field and operation to observable
  evidence in both slices and records rejected similarities.
- A2A identity, task and delegation state remains separately characterized.

## Verification

```sh
bun test packages/llm-core/tests/integrations/characterization
bun run typecheck:tests
bun run lint
```

## Work log

Planned by ADR-015; not claimed.

## Handoff

Pending.
