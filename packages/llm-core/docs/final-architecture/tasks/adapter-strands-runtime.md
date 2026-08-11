---
architecture_version: 2
id: adapter-strands-runtime
title: Strands TypeScript runtime qualification
stage: adapters
status: proposed
priority: medium
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
  - architecture-runtime-ownership-correction
  - runtime-operation-contract-correction
  - architecture-source-layout-normalization
  - capabilities-operational-evidence
  - capabilities-runtime-conformance
  - architecture-release-reproducibility
decision_dependencies:
  - ADR-004
  - ADR-005
  - ADR-006
  - ADR-007
  - ADR-013
  - ADR-015
  - ADR-016
  - ADR-017
conflicts_with:
  - adapter-catalogue-public-qualification
  - adapter-langgraph-runtime
  - adapter-pydantic-ai-runtime
  - runtime-temporal-reference
  - adapters-protocol-qualification
  - runtime-tools-front-boundary
  - architecture-status-validation
  - adapter-openspec-release
  - adapter-pydantic-ai-release
  - adapter-ai-sdlc-release
  - adapter-spec-kit-release
  - adapter-bmad-release
  - applications-client-subpath-release
  - applications-client-characterization
  - applications-client-platform-qualification
  - applications-desktop
  - applications-mobile
write_scope:
  - bun.lock
  - packages/llm-core/package.json
  - packages/llm-core/src/adapters/runtimes/strands/**
  - packages/llm-core/tests/adapters/runtimes/strands/**
  - packages/llm-core/tests/conformance/strands/**
  - packages/llm-core/docs/final-architecture/tasks/adapter-strands-runtime.md
required_reading:
  - path: context/aifsd-research/profiles/strands-agents.md
    reason: "Use the researched Strands TypeScript and Python semantic differences as contextual evidence."
  - path: docs/adapters/runtime-conformance.md
    reason: "Preserve exact portable conformance and native operation ownership."
read_scope:
  - context/aifsd-research/profiles/strands-agents.md
  - docs/adapters/runtime-conformance.md
  - packages/llm-core/src/contracts/**
  - packages/llm-core/src/features/**
  - packages/llm-core/src/application/**
  - packages/llm-core/src/adapters/runtimes/**
review_owner: coordinator
updated_at: 2026-08-04
---

# adapter-strands-runtime — Strands TypeScript runtime qualification

## Objective

Prove the TypeScript-neutral runner boundary against a second independently
implemented TypeScript runtime, using exact Strands versions, native operation
ownership and explicit unsupported operations rather than framework-shaped
core contracts.

## In scope

- A version-pinned Strands TypeScript adapter implementing the narrow
  `AgentRunner` boundary where its native semantics permit it.
- An exact direct development dependency on `@strands-agents/sdk` in the package
  manifest and root lockfile. Source compilation must not rely on a transitive
  dependency.
- A task-local packed/external fixture at
  `tests/adapters/runtimes/strands/external-consumer` with its own manifest and
  lockfile pinning the exact `@strands-agents/sdk` release. Qualification must
  not rely on a transitive workspace dependency.
- Conformance for model/tool events, invocation identity, cancellation,
  intervention, usage attribution, native extensions and declared state
  capabilities.
- An exact operation matrix that separates supported portable operations from
  unsupported or Strands-native behavior, including Python-versus-TypeScript
  Strands differences.

## Out of scope

- A generic team/agent-delegation API, AWS-specific defaults, Cedar policy
  replacement, an implied durable checkpoint claim, or package publication.

## Acceptance criteria

- The adapter passes its declared conformance level without leaking Strands
  types through portable contracts.
- Unsupported approval, checkpoint, sandbox or delegation semantics fail
  explicitly and appear in the support report.
- The local, Python-reference and Strands fixtures preserve the same identity,
  terminal-event and cancellation invariants where each declares support.
- The fixture performs a frozen install and asserts the resolved Strands package
  name and exact version before conformance runs.
- The repository-wide external-fixture gate discovers and reruns the fixture.
- Package source, focused tests and the external fixture resolve the same exact
  qualified SDK version.

## Verification

```sh
bun install --frozen-lockfile
bun install --cwd packages/llm-core/tests/adapters/runtimes/strands/external-consumer --frozen-lockfile
bun run qualify:external-fixtures
bun test packages/llm-core/tests/adapters/runtimes/strands packages/llm-core/tests/conformance/strands
bun run typecheck:packages
bun run typecheck:tests
bun run lint
bun run --cwd packages/llm-core release:build
```

## Work log

Planned from ADR-013; reconciled with the integration-owned execution boundary
in ADR-016; not claimed.

## Handoff

Pending.
