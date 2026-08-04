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
  - architecture-source-layout-normalization
  - integrations-connector-characterization
decision_dependencies:
  - ADR-003
  - ADR-005
  - ADR-007
  - ADR-014
  - ADR-015
conflicts_with:
write_scope:
  - packages/llm-core/src/features/integrations/**
  - packages/llm-core/tests/integrations/**
  - docs/capabilities/integrations.md
  - packages/llm-core/docs/final-architecture/tasks/integrations-connector-contracts.md
read_scope:
  - packages/llm-core/src/contracts/**
  - packages/llm-core/src/features/tooling/**
  - packages/llm-core/src/features/control/**
  - packages/llm-core/src/features/evidence/**
  - packages/llm-core/src/application/**
review_owner: coordinator
updated_at: 2026-08-02
---

# integrations-connector-contracts — Connector manifest and lifecycle contracts

## Objective

Derive only the connector identity, discovery and lifecycle semantics proven
common to both the completed MCP and OAuth SaaS vertical slices. Do not use
this task to introduce A2A, remote-agent, authorization-provider or
usage-provider families.

## In scope

- Versioned connector identity, manifest, configuration schema, effect/data
  classification, health and support/loss declarations that are evidenced in
  both characterized slices.
- Lifecycle ports for discovery, validation, connection health and invocation
  preparation, limited to the behavior shared by both slices.
- Common reliability declarations for idempotency, retries, cancellation and
  reconciliation only where the characterization report traces equivalent
  observable behavior in both slices.
- Conformance fixtures proving unknown capabilities and unsupported semantics
  fail explicitly.
- A traceable mapping from each shared field to both characterized slices;
  MCP tool/resource operations and OAuth SaaS pagination, rate-limit, consent,
  webhook or polling semantics remain slice-owned until separately promoted by
  evidence.

## Out of scope

- OAuth flows or secret storage, concrete SaaS/MCP adapters, workflows, package
  publication, a hosted connector catalogue or provider SDK types in portable
  contracts.
- A2A and remote-agent identity, task or delegation state; these require a
  separate characterization and contract.
- Authorization-provider and usage-provider capability families. Consent and
  usage observations in one slice do not establish a shared family contract.

## Acceptance criteria

- A connector manifest identifies exact contract and adapter versions and
  cannot claim undeclared operations.
- Every field and lifecycle operation in the shared contract is backed by
  executable evidence from both the MCP and OAuth SaaS slices.
- MCP tool/resource and OAuth SaaS-specific operations remain outside the
  common contract; remote-agent, authorization-provider and usage-provider
  families are absent from its public types and serialized values.
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
bun run --cwd packages/llm-core release:build
bun run test:package
bun run docs:check
bun run --cwd packages/llm-core format:check
```

## Work log

Planned from ADR-014 and narrowed by ADR-015; blocked on connector
characterization and not claimed.

## Handoff

Pending.
