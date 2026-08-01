---
architecture_version: 2
id: capabilities-context-qualification
title: Context eligibility and compiler boundary
stage: qualification
status: done
priority: high
preferred_owner_kind: codex
owner: codex-context-qualification
owner_kind: coordinator
lease_started_at: 2026-08-01T03:14:57Z
lease_expires_at: 2026-08-01T11:14:57Z
base_sha: a4ceb81f78a5b8c1fea495d90a511113ed40426b
branch: task/capabilities-context-qualification
worktree: .worktrees/capabilities-context-qualification
depends_on:
  - language-rollout
decision_dependencies:
  - ADR-001
  - ADR-003
  - ADR-013
conflicts_with: []
write_scope:
  - packages/llm-core/src/features/context/**
  - packages/llm-core/tests/context/**
  - docs/capabilities/context.md
  - packages/llm-core/internal/final-architecture/tasks/capabilities-context-qualification.md
read_scope:
  - packages/llm-core/src/contracts/**
  - packages/llm-core/src/features/artifacts/**
  - packages/llm-core/src/features/evidence/**
  - packages/llm-core/src/features/retrieval/**
review_owner: coordinator
updated_at: 2026-08-01T04:15:00Z
---

# capabilities-context-qualification — Context eligibility and compiler boundary

## Objective

Add a provider-neutral context compiler that makes authorization, freshness,
risk treatment, budget allocation and selection evidence explicit before
content reaches an agent or model.

## In scope

- `ContextCompiler` and closed eligibility/selection-evidence contracts.
- Source authorization, tenant/purpose applicability, classification/redaction,
  freshness, precedence and prompt-injection-risk dispositions.
- Deterministic selection under byte/token budgets, with immutable evidence for
  inclusions, exclusions and truncation.
- Feature tests for policy denial, stale source, unsafe content, redaction,
  deterministic ordering and caller-mutation isolation.

## Out of scope

- A vector database, retrieval ranking implementation, long-term-memory
  backend, policy service or automatic prompt-injection classifier.
- A common root API or provider-native context payload.

## Acceptance criteria

- A `ContextSelection` alone cannot be represented as an authorization grant.
- An authorized compiler decision preserves source/provenance evidence and
  reports every excluded or degraded entry explicitly.
- A budget overflow is deterministic and never silently drops content.
- Native retrieval/session fields remain behind adapters or validated
  extensions.

## Verification

```sh
bun test packages/llm-core/tests/context
bun run typecheck:packages
bun run typecheck:tests
bun run lint
```

## Work log

- 2026-08-01 — Coordinator claimed this task after verifying that
  `language-rollout` and ADR-001, ADR-003, and ADR-013 are complete. Work is
  isolated on `task/capabilities-context-qualification` from `a4ceb81`.
- 2026-08-01 — Implementation started in the assigned worktree.
- 2026-08-01 — Completed at `f426841`. The compiler accepts only closed,
  evidence-bearing eligibility facts, requires an explicit evaluation instant,
  and emits immutable inclusion, redaction, and exclusion evidence.
- 2026-08-01 — Coordinator fast-forwarded the reviewed task commits to `main`
  at `0acd4f7`; the receiving context test/type/lint gate passed.

## Handoff

Completed and integrated by the coordinator.

- Commit: `f426841` (`feat(context): add eligibility compiler`)
- Worktree: clean at the implementation commit.
- Changed files:
  - `docs/capabilities/context.md`
  - `packages/llm-core/src/features/context/compiler.ts`
  - `packages/llm-core/src/features/context/public.ts`
  - `packages/llm-core/src/features/context/types.ts`
  - `packages/llm-core/tests/context/compiler.test.ts`
  - this task record
- Verification passed:
  - `bun test tests/context` — 16 passed.
  - `bun run typecheck` and `bun run typecheck:tests` — passed.
  - `bun run lint`, changed-file Prettier check, and `git diff --check` — passed.
  - `bun run contracts:schema:check`, `bun run build`, and `bun run test:package`
    — passed; the packed consumer verified 29 entrypoints.
- Known baseline issue: full `bun test` ran 548 passing tests and one intentional
  skip, but two architecture-boundary tests fail on the same
  `application/specification-compiler` deep imports at `main`. They are outside
  this task's write scope and owned by the active specification work.
- ADRs applied: ADR-001, ADR-003, ADR-013. No deviations.
- Remaining risk: eligibility facts are composition-supplied declarations, not
  a policy service or automatic prompt-injection classifier. The compiler
  validates and records those facts but deliberately does not claim an
  independent authorization decision.
- Shared-file requests: none.
- Main integration: `0acd4f7` (fast-forwarded after review).
- Coordinator status: completed.
