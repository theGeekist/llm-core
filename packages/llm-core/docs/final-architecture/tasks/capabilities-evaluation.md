---
architecture_version: 2
id: capabilities-evaluation
legacy_id: P1-220
title: Evaluation domain
stage: capabilities
status: done
priority: high
preferred_owner_kind: codex
owner: codex-evaluation-domain
owner_kind: codex
lease_started_at: 2026-07-30T04:15:41+08:00
lease_expires_at: 2026-08-01T04:15:41+08:00
base_sha: 2693e91e22c8429d5067509a72a88d879d3cb9c4
branch: task/P1-220-evaluation
worktree: /Users/jasonnathan/Repos/@theGeekist/llm-core/.worktrees/P1-220-evaluation
depends_on:
  - core-convergence
  - capabilities-context-artifacts
decision_dependencies:
  - ADR-001
  - ADR-003
  - ADR-005
conflicts_with: []
write_scope:
  - packages/llm-core/src/features/evaluation/**
  - packages/llm-core/tests/evaluation/**
  - packages/llm-core/docs/final-architecture/tasks/capabilities-evaluation.md
read_scope:
  - packages/llm-core/src/contracts/**
  - packages/llm-core/src/features/evidence/**
  - packages/llm-core/src/features/context/**
  - packages/llm-core/src/features/artifacts/**
review_owner: coordinator
updated_at: 2026-07-30
---

# capabilities-evaluation — Evaluation domain

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

- 2026-07-30 — Promoted to ready by the coordinator after capabilities-context-artifacts completed,
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
- 2026-07-30T04:29:23+08:00 — Remediated independent review findings by
  rejecting explicitly present undefined optional evidence schemas at both
  case and result boundaries and normalizing all closed case, evaluator,
  judgement, score, and evidence records from data-property descriptors.
  Adversarial proxy coverage confirms zero ordinary property reads. Focused
  evaluation tests, the 451-test package suite, package/test typechecks,
  architecture tests, contract schema check, lint, and diff validation pass.
- 2026-07-30 — Independently approved at exact SHA `e885f36`. Final review
  confirmed evidence-only inputs, exact evidence linkage, immutable
  deterministic evaluator identity/version order, sync-preserving
  `MaybePromise` composition, explicit-undefined rejection and zero-read
  descriptor snapshots.
- 2026-07-30 — Integrated into `main` and published through the dedicated
  `./evaluation` front with matching alias, build entry, architecture
  characterization and isolated package-consumer coverage.

## Handoff

- Integration published `src/features/evaluation/public.ts` as the
  `./evaluation` subpath with matching TypeScript/package aliases, build entry,
  exact public-surface characterization and package smoke coverage.
- No root export, provider dependency or runner adapter change was added.
