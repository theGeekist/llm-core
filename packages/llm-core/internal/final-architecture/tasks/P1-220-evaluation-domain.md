---
architecture_version: 2
id: P1-220
title: Evaluation domain
phase: P1.1
status: review
priority: P1
preferred_owner_kind: codex
owner: codex-evaluation-domain
owner_kind: codex
lease_started_at: 2026-07-30T04:15:41+08:00
lease_expires_at: 2026-08-01T04:15:41+08:00
base_sha: 2693e91e22c8429d5067509a72a88d879d3cb9c4
branch: task/P1-220-evaluation
worktree: /Users/jasonnathan/Repos/@theGeekist/llm-core/.worktrees/P1-220-evaluation
depends_on:
  - P0-150
  - P1-210
decision_dependencies:
  - ADR-001
  - ADR-003
  - ADR-005
conflicts_with: []
write_scope:
  - packages/llm-core/src/features/evaluation/**
  - packages/llm-core/tests/evaluation/**
  - packages/llm-core/internal/final-architecture/tasks/P1-220-evaluation-domain.md
read_scope:
  - packages/llm-core/src/contracts/**
  - packages/llm-core/src/features/evidence/**
  - packages/llm-core/src/features/context/**
  - packages/llm-core/src/features/artifacts/**
review_owner: coordinator
updated_at: 2026-07-30
---

# P1-220 — Evaluation domain

## Objective

Add a first-class evaluation domain that consumes execution evidence without coupling evaluation to a provider or agent runner.

## Deliverables

- Contracts for evaluators, cases, results, scores, and evidence references.
- Deterministic evaluator identity and version metadata.
- A feature public surface with no provider-specific dependencies.
- Focused tests for evaluator composition and evidence linkage.

## Acceptance criteria

- Evaluation consumes recorded evidence rather than runtime internals.
- Results distinguish status, score, explanation, and referenced evidence.
- Async boundaries preserve the package's `MaybePromise` composition style.
- Shared export changes are left for the integration owner.

## Verification

```sh
bun test packages/llm-core/tests/evaluation
bun run typecheck:packages
```

## Work log

- 2026-07-30 — Promoted to ready by the coordinator after P1-210 completed,
  passed independent review and integrated into `main`.
- 2026-07-30T04:15:41+08:00 — Claimed by the Codex evaluation worker from
  integrated context/artifact base
  `2693e91e22c8429d5067509a72a88d879d3cb9c4`.
- 2026-07-30T04:21:23+08:00 — Implemented provider-neutral evaluation cases,
  deterministic versioned evaluator composition, normalized scores/statuses,
  explanations, and strict linkage to recorded `EvidenceRef` values.
- 2026-07-30T04:21:23+08:00 — Focused evaluation and architecture tests,
  package/test typechecks, contract schema check, lint, targeted formatting,
  and diff validation passed. The repository-wide formatting check remains
  red only for 45 pre-existing files outside this task's write scope.

## Handoff

- Integration owner should publish `src/features/evaluation/public.ts` as the
  `./evaluation` subpath and add the matching TypeScript/package import aliases,
  build entry, and exact public-surface characterization.
- No root export is proposed. No provider or runner adapter changes are needed.
