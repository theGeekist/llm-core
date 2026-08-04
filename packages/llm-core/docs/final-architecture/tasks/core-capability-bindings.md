---
architecture_version: 2
id: core-capability-bindings
legacy_id: P0-149
title: Implement capability bindings and invocation bridge
stage: core
status: done
priority: critical
preferred_owner_kind: codex
owner: codex-root
owner_kind: codex
lease_started_at: 2026-07-30T00:38:10+08:00
lease_expires_at: 2026-07-31T00:38:10+08:00
base_sha: a532ce8337e670cc05a623a80446dacd4a04085e
branch: task/P0-149-codex
worktree: /Users/jasonnathan/Repos/@theGeekist/llm-core/.worktrees/P0-149-codex
depends_on:
  - core-tool-control-events
  - core-state-interventions
  - core-agent-runner
  - core-knowledge
  - core-conversations
  - core-media-schemas-skills
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
  - packages/llm-core/docs/final-architecture/tasks/core-capability-bindings.md
review_owner: coordinator
updated_at: 2026-07-30
---

# core-capability-bindings — Capability Bindings and Invocation Bridge

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
  core-knowledge, core-conversations and core-media-schemas-skills passed independent review and receiving
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
- 2026-07-30 — Closed final executable review blockers: every retryable
  non-tool closure now requires idempotency or reconciliation regardless of
  caller phase/effect labels, and registration captures data-only outer,
  portable, property and callable boundaries once before the verifier attests
  the exact immutable facade that is published.
- 2026-07-30 — Final remediation verification passed: 31 focused tests; package
  and test typechecks; schema freshness; scoped ESLint; `git diff --check`; and
  the full package suite with 1,343 passing, 35 credential-gated skips, and zero
  failures.
- 2026-07-30 — Normalized the remaining descriptor clone boundary: nested
  transparent proxies and other uncloneable portable lookalikes now fail with
  the stable registration `TypeError`; symbol and cycle failures retain the
  same safe diagnostic without native clone details.
- 2026-07-30 — Independently approved at exact SHA
  `aaa49e6cad0b29fb9889e0ea773e62e1374bc221`, integrated into `main`, and
  completed after all 32 focused capability-binding tests and the package
  verification gates passed.

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
- core-convergence should integrate/export these fronts through shared manifests and
  public entrypoints; no shared export or manifest was changed here.
- Review against ADR-001 through ADR-008. No decision or dependency blocker
  remains.
