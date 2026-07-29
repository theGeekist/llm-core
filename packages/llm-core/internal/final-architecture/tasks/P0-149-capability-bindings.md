---
architecture_version: 2
id: P0-149
title: Implement capability bindings and invocation bridge
phase: P0.4
status: proposed
priority: P0
preferred_owner_kind: codex
owner: null
owner_kind: null
lease_started_at: null
lease_expires_at: null
base_sha: null
branch: null
worktree: null
depends_on:
  - P0-110
  - P0-130
  - P0-140
  - P0-141
  - P0-142
  - P0-143
decision_dependencies:
  - ADR-001
  - ADR-002
  - ADR-003
  - ADR-004
  - ADR-005
  - ADR-006
  - ADR-007
  - ADR-008
conflicts_with: []
write_scope:
  - packages/llm-core/src/application/capability-bindings/**
  - packages/llm-core/src/composition/capability-bindings/**
  - packages/llm-core/tests/application/capability-bindings/**
  - packages/llm-core/internal/final-architecture/tasks/P0-149-capability-bindings.md
review_owner: coordinator
updated_at: 2026-07-29
---

# P0-149 — Capability Bindings and Invocation Bridge

## Objective

Replace adapter bundle/registry/context contracts with deterministic typed
bindings over the completed feature fronts.

## Acceptance criteria

- Runtime bindings pair evidence-backed portable descriptors with typed live
  feature ports.
- Resolution rejects missing, ambiguous and incompatible requirements without
  first-list or provider fallback.
- Adapter call context maps to `InvocationContext`; pause/resume maps to state.
- Retry policy is qualified and guarantee-bearing.
- No adapter vocabulary or unconstrained escape hatch enters the new front.

## Verification

```sh
bun test packages/llm-core/tests/application/capability-bindings
bun run typecheck:packages
```

## Work log

## Handoff
