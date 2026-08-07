---
architecture_version: 2
id: runtime-temporal-reference
title: Temporal durable execution reference
stage: qualification
status: proposed
priority: high
preferred_owner_kind: coordinator
owner:
owner_kind:
lease_started_at:
lease_expires_at:
base_sha:
branch:
worktree:
depends_on:
  - architecture-external-contract-fidelity
  - runtime-operation-contract-correction
  - architecture-source-layout-normalization
  - runtime-receipt-reconciliation
  - capabilities-runtime-conformance
  - architecture-release-reproducibility
decision_dependencies:
  - ADR-005
  - ADR-006
  - ADR-007
  - ADR-013
  - ADR-015
  - ADR-017
conflicts_with:
  - adapter-strands-runtime
  - adapters-protocol-qualification
  - runtime-tools-front-boundary
  - architecture-status-validation
  - adapter-openspec-release
  - adapter-pydantic-ai-release
  - adapter-ai-sdlc-release
  - adapter-spec-kit-release
  - adapter-bmad-release
  - adapter-strands-runtime-release
  - applications-client-subpath-release
  - applications-client-characterization
  - applications-client-platform-qualification
  - applications-desktop
  - applications-mobile
write_scope:
  - bun.lock
  - packages/llm-core/package.json
  - packages/llm-core/src/adapters/runtimes/temporal/**
  - packages/llm-core/tests/conformance/temporal/**
  - packages/llm-core/tests/adapters/runtimes/temporal/**
  - docs/adapters/runtime-conformance.md
  - packages/llm-core/docs/final-architecture/tasks/runtime-temporal-reference.md
required_reading:
  - path: context/aifsd-research/profiles/temporal-python.md
    reason: "Use the researched Temporal durability boundary and version caveats as contextual evidence."
  - path: docs/adapters/runtime-conformance.md
    reason: "Preserve portable versus runtime-owned state and history distinctions."
  - path: packages/llm-core/docs/final-architecture/EXTERNAL-CONTRACT-FIDELITY-IMPACT.md
    reason: "Apply the accepted exact-operation correction without treating narrowed Temporal semantics as supported runtime fidelity."
read_scope:
  - context/aifsd-research/profiles/temporal-python.md
  - docs/adapters/runtime-conformance.md
  - packages/llm-core/docs/final-architecture/EXTERNAL-CONTRACT-FIDELITY-IMPACT.md
  - packages/llm-core/src/contracts/**
  - packages/llm-core/src/features/control/**
  - packages/llm-core/src/features/evidence/**
  - packages/llm-core/src/features/state/**
  - packages/llm-core/src/application/**
review_owner: coordinator
updated_at: 2026-08-07
---

# runtime-temporal-reference — Temporal durable execution reference

## Objective

Qualify one service-backed durable reference path without changing the portable
meaning of a checkpoint, provider session, or external effect.

## In scope

- An internal Temporal adapter/reference using idempotent model and tool
  activities, version-pinned support declarations and conformance fixtures.
- Exact direct development dependencies on the required `@temporalio/*`
  packages in the package manifest and root lockfile. Adapter source must not
  rely on transitive or fixture-local resolution.
- A task-local integration fixture at
  `tests/adapters/runtimes/temporal/external-consumer` with its own manifest and
  lockfile pinning the exact Temporal SDK/test-service dependencies. It must not
  rely on transitive root dependencies.
- Approval and cancellation signal/update mapping, durable timers and restart
  recovery.
- Replay, worker-loss, duplicate-delivery, retry-classification and ambiguous
  side-effect fixtures correlated to receipt reconciliation.
- An explicit runtime-owned `DurableExecutionHandle` mapping and documented
  unsupported semantics.

## Out of scope

- A Temporal server deployment, hosted worker fleet, universal checkpoint
  exchange, automatic exactly-once side effects, or a public adapter entrypoint
  before its own publication decision.

## Acceptance criteria

- A replay or restart does not re-run a known recorded effect.
- Model/tool activity retries preserve action, idempotency and receipt
  identities.
- Approval, cancellation, timer and terminal-run behavior are exercised across
  a real durable boundary, not a fake in-process scheduler.
- The fixture performs a frozen install, asserts the resolved SDK versions and
  starts an ephemeral Temporal test service; no production deployment is
  required.
- The repository-wide external-fixture gate discovers and reruns the fixture.
- Package source, focused tests and the external fixture resolve the same exact
  qualified Temporal SDK versions.
- The exact operation matrix distinguishes Temporal-owned history from
  portable state and uses `supported`, `unsupported` or `not-applicable` for
  every operation. Each `not-applicable` entry cites exact-version Temporal
  contract evidence that the operation or semantic dimension is absent.

## Verification

```sh
bun install --frozen-lockfile
bun install --cwd packages/llm-core/tests/adapters/runtimes/temporal/external-consumer --frozen-lockfile
bun run qualify:external-fixtures
bun test packages/llm-core/tests/conformance/temporal packages/llm-core/tests/adapters/runtimes/temporal
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
