---
architecture_version: 2
id: P0-140
title: Implement AgentRunner and local runner
phase: P0.3
status: complete
priority: P0
preferred_owner_kind: codex
owner: codex-root
owner_kind: codex
lease_started_at: 2026-07-29T22:35:00+08:00
lease_expires_at: null
base_sha: e13eff0
branch: task/P0-140-codex
worktree: /Users/jasonnathan/Repos/@theGeekist/llm-core/.worktrees/P0-140-codex
depends_on:
  - P0-110
  - P0-120
  - P0-130
decision_dependencies:
  - ADR-002
  - ADR-006
conflicts_with: []
write_scope:
  - packages/llm-core/src/features/agent/**
  - packages/llm-core/src/application/agent/**
  - packages/llm-core/tests/agent/**
  - packages/llm-core/tests/application/agent/**
  - packages/llm-core/internal/final-architecture/tasks/P0-140-local-agent-runner.md
review_owner: coordinator
updated_at: 2026-07-29
---

# P0-140 — Implement AgentRunner and Local Runner

## Objective

Introduce the neutral runner/run/control port and convert the current
recipe-backed implementation without exposing recipe internals.

## In scope

Agent spec, capabilities, start/events/result/cancel/resume contract, local
runner implementation, parent/child run identity and subagent recursion.

## Out of scope

Root exports, UI adapters, external runtime adapters and old-name deletion.

## Acceptance criteria

- Runner capabilities are inspectable before execution.
- Start, events, result, cancellation and optional resume test independently.
- Parent/child causal identity survives subagent execution.
- A fake remote runner passes the same contract suite.

## Verification

```sh
bun test packages/llm-core/tests/agent packages/llm-core/tests/application/agent
bun run typecheck:packages
```

## Work log

- 2026-07-29T22:35:00+08:00 — Claimed by the Codex coordinator after P0-130
  integrated and passed receiving verification.
- 2026-07-29 — Implementation started in the isolated task worktree.
- 2026-07-29 — Implemented the portable agent contract and local lifecycle
  runner, including capability-gated preparation, canonical event streaming,
  cooperative cancellation, run-bound interventions, compatible checkpoint
  resume and runner-routed child causality.
- 2026-07-29 — Amended the review commit with runner-owned preparation,
  checkpoint effect-replay guards, fully resolved pending interventions,
  validated child boundaries, atomic terminal settlement and closed portable
  runtime validation.
- 2026-07-29 — Closed the lifecycle event facts union, removed raw progress
  and cancellation-reason projection, and made cancellation/intervention
  state changes atomic with their canonical control facts.
- 2026-07-29 — Completed the neutral intervention event contract with its
  safe action binding, checkpoint revision, decision window and allowed
  controls so remote/UI consumers can construct authenticated decisions.
- 2026-07-29T22:55:00+08:00 — Integrated on main at `104e8a8`; receiving
  verification passed 21 tests, package typecheck/schema, focused lint and diff
  check. Task marked complete.

## Handoff

- Commit: task branch HEAD; exact SHA is reported to the coordinator after the
  handoff commit is created.
- Worktree: clean at the reported commit.
- Changed files:
  - `packages/llm-core/src/features/agent/public.ts`
  - `packages/llm-core/src/features/agent/spec.ts`
  - `packages/llm-core/src/features/agent/types.ts`
  - `packages/llm-core/src/application/agent/local-runner.ts`
  - `packages/llm-core/src/application/agent/public.ts`
  - `packages/llm-core/src/application/agent/resume-effects.ts`
  - `packages/llm-core/src/application/agent/types.ts`
  - `packages/llm-core/src/application/agent/validation.ts`
  - `packages/llm-core/tests/agent/spec.test.ts`
  - `packages/llm-core/tests/application/agent/local-runner.test.ts`
  - this task file
- Verification:
  - `bun test packages/llm-core/tests/agent packages/llm-core/tests/application/agent`
    — exit 0; 21 passed, 0 failed.
  - `bun run typecheck:packages` — exit 0; package typecheck and schema
    freshness passed.
  - focused ESLint over the changed source/test directories — exit 0.
  - `git diff --check` — exit 0.
- ADRs applied: ADR-002, ADR-005 and ADR-006; no deviations.
- Remaining risks: root exports and legacy recipe/runtime convergence are
  intentionally outside this task. The local lifecycle accepts an injected
  `LocalAgentProgramPort`; P0-150 owns repository-wide legacy replacement.
- Shared-file requests: export the agent feature and application public fronts
  from the package entrypoints during P0-150.
