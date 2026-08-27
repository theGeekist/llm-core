---
id: capabilities-workspace-sandbox
title: Execution workspace and sandbox port
stage: qualification
status: proposed
priority: medium
depends_on:
  - architecture-source-layout-normalization
  - runtime-receipt-reconciliation
  - runtime-tools-front-boundary
decision_dependencies:
  - ADR-003
  - ADR-005
  - ADR-006
  - ADR-013
  - ADR-015
conflicts_with: []
write_scope:
  - packages/llm-core/src/features/workspace/**
  - packages/llm-core/src/adapters/workspace/**
  - packages/llm-core/tests/workspace/**
  - docs/capabilities/control.md
  - packages/llm-core/docs/final-architecture/tasks/capabilities-workspace-sandbox.md
required_reading:
  - path: docs/capabilities/control.md
    reason: "Preserve the controlled-effect boundary when defining host and isolated workspace capabilities."
read_scope:
  - docs/capabilities/control.md
  - packages/llm-core/src/contracts/**
  - packages/llm-core/src/features/artifacts/**
  - packages/llm-core/src/features/evidence/**
  - packages/llm-core/src/features/tooling/**
  - packages/llm-core/src/tools/**
review_owner: coordinator
updated_at: 2026-08-02
---

# capabilities-workspace-sandbox — Execution workspace and sandbox port

## Objective

Define the neutral boundary required by coding-agent and command-executing
runtimes without misrepresenting host execution as an isolation guarantee.

## In scope

- `ExecutionWorkspace`/`SandboxExecutor` contracts for preparation, command
  execution, snapshot, restore, disposal, cancellation and deadlines.
- Declared process, filesystem and network capabilities, explicit host versus
  isolated execution disposition, and artifact/effect receipts.
- Conformance fixtures for capability denial, cancellation, cleanup failure,
  snapshot compatibility and unsandboxed host reporting.

## Out of scope

- Provisioning a VM/container, a shell implementation, source-control patch
  engine, remote credentials, a coding-agent harness, or a public root entry.

## Acceptance criteria

- Missing isolation is reported as unsandboxed and cannot satisfy a policy
  requiring isolation.
- Workspace actions use the controlled effect/receipt path.
- Snapshots state their owner and compatibility; they are not a portable
  `ResumableCheckpoint`.

## Verification

```sh
bun test packages/llm-core/tests/workspace
bun run typecheck:packages
bun run typecheck:tests
bun run lint
bun run --cwd packages/llm-core release:build
bun run test:package
bun run docs:check
bun run --cwd packages/llm-core format:check
```

## Work log

Planned from ADR-013; not claimed.

## Handoff

Pending.
