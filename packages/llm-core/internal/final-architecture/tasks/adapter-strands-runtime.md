---
architecture_version: 2
id: adapter-strands-runtime
title: Strands TypeScript runtime qualification
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
  - capabilities-operational-evidence
  - capabilities-runtime-conformance
decision_dependencies:
  - ADR-004
  - ADR-005
  - ADR-006
  - ADR-007
  - ADR-013
conflicts_with: []
write_scope:
  - packages/llm-core/src/adapters/runtimes/strands/**
  - packages/llm-core/tests/adapters/runtimes/strands/**
  - packages/llm-core/tests/conformance/strands/**
  - packages/llm-core/internal/final-architecture/tasks/adapter-strands-runtime.md
read_scope:
  - packages/llm-core/src/contracts/**
  - packages/llm-core/src/features/**
  - packages/llm-core/src/application/**
  - packages/llm-core/src/adapters/runtimes/**
review_owner: coordinator
updated_at: 2026-08-01
---

# adapter-strands-runtime — Strands TypeScript runtime qualification

## Objective

Prove the TypeScript-neutral runner boundary against a second independently
implemented TypeScript runtime, using exact Strands versions and explicit
semantic loss rather than framework-shaped core contracts.

## In scope

- A version-pinned Strands TypeScript adapter implementing the narrow
  `AgentRunner` boundary where its native semantics permit it.
- Conformance for model/tool events, invocation identity, cancellation,
  intervention, usage attribution, native extensions and declared state
  capabilities.
- A compatibility report that separates supported, projected, lossy and
  unsupported behavior, including Python-versus-TypeScript Strands differences.

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

## Verification

```sh
bun test packages/llm-core/tests/adapters/runtimes/strands packages/llm-core/tests/conformance/strands
bun run typecheck:packages
bun run typecheck:tests
bun run lint
```

## Work log

Planned from ADR-013; not claimed.

## Handoff

Pending.
