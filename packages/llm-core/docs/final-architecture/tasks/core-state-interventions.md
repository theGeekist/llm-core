---
architecture_version: 2
id: core-state-interventions
legacy_id: P0-130
title: Implement state and intervention vertical slice
stage: core
status: done
priority: critical
preferred_owner_kind: codex
owner: codex-root
owner_kind: codex
lease_started_at: 2026-07-29T19:15:00+08:00
lease_expires_at: null
base_sha: 6b9838c
branch: task/P0-130-codex
worktree: /Users/jasonnathan/Repos/@theGeekist/llm-core/.worktrees/P0-130-codex
depends_on:
  - core-tool-control-events
decision_dependencies:
  - ADR-005
  - ADR-006
conflicts_with: []
write_scope:
  - packages/llm-core/src/features/state/**
  - packages/llm-core/src/application/workflow/**
  - packages/llm-core/tests/state/**
  - packages/llm-core/tests/application/workflow/**
  - packages/llm-core/docs/final-architecture/tasks/core-state-interventions.md
review_owner: coordinator
updated_at: 2026-07-29
---

# core-state-interventions — Implement State and Intervention Vertical Slice

## Objective

Convert one workflow approval path to explicit state lifetimes and
action-bound intervention decisions.

## In scope

Live continuation, snapshot, resumable checkpoint, durable handle,
compatibility records, resume strategy and one workflow resume path.

## Out of scope

Interaction sessions, external durable engine, entire workflow-directory move
and public export convergence.

## Acceptance criteria

- Live continuation cannot masquerade as JSON checkpoint data.
- Incompatible runtime/schema/code resume is rejected.
- Completed side effects are not re-executed.
- Approve, deny, defer, edit, cancel and escalate remain distinct.

## Verification

```sh
bun test packages/llm-core/tests/state packages/llm-core/tests/application/workflow
bun run typecheck:packages
```

## Work log

- 2026-07-29T19:15:00+08:00 — Reassigned from the retired Claude allocation
  and claimed by the Codex coordinator for delegated subagent execution.
- 2026-07-29 — Implementation started in the assigned isolated worktree.
- 2026-07-29 — Implementation and adversarial review completed; moved to
  `review`.
- 2026-07-29T22:35:00+08:00 — Integrated on main through `e13eff0`; receiving
  tests, typecheck/schema, lint and diff check passed. Task marked complete.

## Handoff

- Implementation commit: `c82651f`
- Worktree state: clean at `c82651f` before this handoff-only update.
- Changed files:
  - `packages/llm-core/docs/final-architecture/tasks/core-state-interventions.md`
  - `packages/llm-core/src/application/workflow/execution.ts`
  - `packages/llm-core/src/application/workflow/public.ts`
  - `packages/llm-core/src/application/workflow/resume.ts`
  - `packages/llm-core/src/application/workflow/types.ts`
  - `packages/llm-core/src/features/state/compatibility.ts`
  - `packages/llm-core/src/features/state/intervention.ts`
  - `packages/llm-core/src/features/state/lifetimes.ts`
  - `packages/llm-core/src/features/state/public.ts`
  - `packages/llm-core/src/features/state/types.ts`
  - `packages/llm-core/src/features/state/validation.ts`
  - `packages/llm-core/tests/application/workflow/resume.test.ts`
  - `packages/llm-core/tests/state/compatibility.test.ts`
  - `packages/llm-core/tests/state/helpers.ts`
  - `packages/llm-core/tests/state/intervention.test.ts`
  - `packages/llm-core/tests/state/lifetimes.test.ts`
- Verification:
  - `bun test packages/llm-core/tests/state packages/llm-core/tests/application/workflow`
    — exit 0; 30 passed, 0 failed.
  - `bun run typecheck:packages` — exit 0; package typecheck and generated
    contract-schema consistency check passed.
  - `bunx eslint packages/llm-core/src/features/state packages/llm-core/src/application/workflow packages/llm-core/tests/state packages/llm-core/tests/application/workflow`
    — exit 0.
  - `git diff --check` — exit 0.
- ADRs applied: ADR-005 and ADR-006. No deviations.
- Independent review: approved after adversarial checks for exact action
  canonicalization/HMAC binding, authenticated intervention decisions,
  expiry, decision/intervention replay, checkpoint CAS, durable effect
  transitions and unsafe replay.
- Remaining risks and semantic loss: no known semantic loss within task scope.
  The storage-neutral journal still requires a conforming durable host
  implementation; an external durable engine remains explicitly out of scope.
- Shared-file requests: convergence must expose the new `state` and `workflow`
  public fronts through package exports. No shared file was changed here.
