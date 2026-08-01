---
architecture_version: 2
id: capabilities-evaluation-qualification
title: Evaluation qualification and promotion
stage: qualification
status: done
priority: high
preferred_owner_kind: codex
owner: codex-evaluation-qualification
owner_kind: coordinator
lease_started_at: 2026-08-01T04:02:25Z
lease_expires_at: 2026-08-01T12:02:25Z
base_sha: df7c34c85c783b42d2375a854792ae4808cb487a
branch: main
worktree: .
depends_on:
  - capabilities-evaluation
  - language-rollout
decision_dependencies:
  - ADR-003
  - ADR-005
  - ADR-013
conflicts_with: []
write_scope:
  - packages/llm-core/src/features/evaluation/**
  - packages/llm-core/tests/evaluation/**
  - docs/capabilities/evaluation.md
  - packages/llm-core/internal/final-architecture/tasks/capabilities-evaluation-qualification.md
read_scope:
  - packages/llm-core/src/contracts/**
  - packages/llm-core/src/features/evidence/**
  - packages/llm-core/src/features/artifacts/**
review_owner: coordinator
updated_at: 2026-08-01T06:56:05Z
---

# capabilities-evaluation-qualification — Evaluation qualification and promotion

## Objective

Extend evidence-based evaluation from individual cases to reproducible,
independently promotable qualification without coupling it to one provider,
runner, or optimizer.

## In scope

- Immutable dataset, split, baseline, candidate and slice identities/digests.
- Final-output, trajectory, tool-use and safety assertions, plus uncertainty
  only where an evaluator can supply a defined value.
- Threshold and release-decision contracts that bind evaluator, dataset,
  evidence, policy and accountable decision-maker.
- Optimizer/candidate lineage and a held-out promotion gate distinct from an
  optimizer's search metric.

## Out of scope

- A hosted evaluation dashboard, judge model, training service, DSPy runtime,
  or automatic production deployment.

## Acceptance criteria

- Evaluation results cannot be promoted without exact dataset/split/evaluator
  identity and referenced evidence.
- Optimization output is an artifact/candidate, not a release decision.
- Trajectory assertions consume recorded evidence and do not read runner
  internals.
- Existing evaluator composition preserves `MaybePromise` behavior.

## Verification

```sh
bun test packages/llm-core/tests/evaluation
bun run typecheck:packages
bun run typecheck:tests
bun run lint
```

## Work log

- 2026-08-01 — Coordinator claimed this independent task on `main` from
  `df7c34c`. No active task has an overlapping write scope, so a separate
  worktree is unnecessary.
- 2026-08-01 — Completed at `effad3c`, documented at `3ec4e39`, and corrected
  after review at `62ebab8`. Focused evaluation tests and both typechecks pass.

## Handoff

Completed and integrated on `main`.

- Commits: `effad3c`, `3ec4e39`, `62ebab8`.
- Scope: immutable dataset/split/baseline/candidate identities, validated
  results and optional uncertainty, threshold qualification, held-out
  promotion, and exact optimizer baseline revision lineage.
- Verification: focused evaluation tests and package/test typechecks passed.
- No shared-file requests.
