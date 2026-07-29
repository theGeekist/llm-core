---
architecture_version: 2
id: P0-149
title: Implement capability bindings and invocation bridge
phase: P0.4
status: review
priority: P0
preferred_owner_kind: codex
owner: codex-root
owner_kind: codex
lease_started_at: 2026-07-30T00:38:10+08:00
lease_expires_at: 2026-07-31T00:38:10+08:00
base_sha: a532ce8337e670cc05a623a80446dacd4a04085e
branch: task/P0-149-codex
worktree: /Users/jasonnathan/Repos/@theGeekist/llm-core/.worktrees/P0-149-codex
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
updated_at: 2026-07-30
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

- 2026-07-30T00:38:10+08:00 — Claimed by the Codex coordinator after
  P0-141, P0-142 and P0-143 passed independent review and receiving
  verification.
- 2026-07-30T01:10:00+08:00 — Implementation started from coordinator-provided
  base `a532ce8` after reading the accepted ADRs, coordination rules, completed
  feature fronts and legacy bundle/registry/context parity evidence.
- 2026-07-30 — Implemented closed typed bindings for every completed feature
  port, evidence-bound registration, deterministic atomic resolution, exact
  invocation/state bridges, and guarantee-qualified retry.
- 2026-07-30 — Verification passed: 24 focused tests; package and test
  typechecks; schema freshness; scoped ESLint; `git diff --check`; and the full
  package suite with 1,336 passing, 35 credential-gated skips, and zero failures.
- 2026-07-30 — Remediated independent review findings: mixed-effect after-start
  retry cannot rely on a caller-declared read-only label; registration now
  publishes an immutable bound facade and verifies kind plus implementation
  identity; contradictory and multi-match evidence fails closed; tooling digest
  and validation ports are complete; safe contract extensions are preserved.
- 2026-07-30 — Remediation verification passed: 29 focused tests; package and
  test typechecks; schema freshness; scoped ESLint; `git diff --check`; and the
  full package suite with 1,341 passing, 35 credential-gated skips, and zero
  failures.

## Handoff

- Changed only the task write scope: application and composition
  `capability-bindings` fronts, focused tests, and this task record.
- Descriptors are portable, cloned and deeply frozen; live ports remain live.
  Registration requires implementation-bound trusted evidence.
- Resolution supports exact IDs, named defaults, or a single unique eligible
  binding. Missing, forged, incompatible, conditional-unproven, or ambiguous
  inputs produce a sorted code-only unresolved result with no partial plan.
- Invocation accepts only the closed `InvocationContext` and typed existing
  state lifetimes. Retry defaults to one attempt and requires an exact verified
  guarantee plus explicit bounded policy for replay.
- P0-150 should integrate/export these fronts through shared manifests and
  public entrypoints; no shared export or manifest was changed here.
- Review against ADR-001 through ADR-008. No decision or dependency blocker
  remains.
