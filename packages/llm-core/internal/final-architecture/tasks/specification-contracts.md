---
architecture_version: 2
id: specification-contracts
title: Specification model and conversion
stage: specifications
status: review
priority: high
preferred_owner_kind: coordinator
owner: codex-specification-contracts
owner_kind: codex
lease_started_at: 2026-08-01T06:30:35+08:00
lease_expires_at: 2026-08-02T06:30:35+08:00
base_sha: d3023639b4a02463959cde30cee7e30ec7cd8c9f
branch: task/specification-contracts
worktree: /Users/jasonnathan/Repos/@theGeekist/llm-core/.worktrees/specification-contracts
depends_on:
  - language-rollout
decision_dependencies:
  - ADR-001
  - ADR-003
  - ADR-009
  - ADR-011
  - ADR-012
conflicts_with: []
write_scope:
  - packages/llm-core/src/features/specifications/**
  - packages/llm-core/tests/specifications/**
  - packages/llm-core/internal/final-architecture/tasks/specification-contracts.md
read_scope:
  - packages/llm-core/src/contracts/**
  - packages/llm-core/src/features/artifacts/**
  - packages/llm-core/src/features/evidence/**
review_owner: coordinator
updated_at: 2026-08-01
---

# specification-contracts — Specification model and conversion

## Objective

Introduce the portable, framework-neutral model required to load, combine and
check specification material without treating a loaded source as execution
authority.

## Deliverables

- Versioned format and importer/exporter capability declarations.
- Immutable `SpecificationSourceSnapshot`, `SpecificationGraph` and typed node/relationship
  contracts.
- First-class source authority, decisions, unresolved questions and native
  extension preservation.
- Structured conversion fidelity and issue reporting.
- A `SpecificationDecision` discriminated outcome with accepted, rejected and
  needs-input branches. Its accepted branch carries a portable
  `SpecificationDecisionRecord` binding the exact resolved digest,
  accepted scope, decision/evidence, authority, policy versions, source
  revisions and expiry/invalidation conditions.
- A portable `ProposedSpecificationChange` binding proposed semantic changes
  and their evidence to an exact target source revision and digest.
- Adversarial validation for accessors, proxies, symbols, cycles, sparse
  arrays, duplicate identities and dangling relationships.

## Acceptance criteria

- The canonical graph may contain cycles and does not pretend to be a workflow
  DAG.
- Every node and relationship has stable identity and source traceability.
- Native material is namespaced and strict JSON.
- Import results, resolved specifications and portable specification decision
  records
  cannot be passed where runtime-registered decision authority is required.
- A change proposal is pure data. It cannot apply itself, mutate a source or
  imply source-owner acceptance.
- Feature code depends only on contracts, artifact/evidence public fronts and
  feature-local modules.

## Verification

```sh
bun test packages/llm-core/tests/specifications
bun run typecheck:packages
bun run typecheck:tests
bun run lint
```

## Work log

- 2026-07-30 — ADR-009 accepted and task made ready for implementation.
- 2026-07-30 — Blocked behind the language stage so exact public terminology is
  settled before
  the specification contracts are created.
- 2026-08-01 — Promoted to ready after `language-rollout` completed at
  `71b21de`. ADR-012 now fixes the public specification vocabulary; no
  language-stage decision remains unresolved.
- 2026-08-01 — Implemented the portable contracts in `a40a939` on
  `task/specification-contracts`: detached source snapshots, semantic graph,
  conversion/support declarations, portable decision records and pure change
  proposals. The graph validates reference integrity while preserving cycles.

## Handoff

Ready for coordinator review.

- Commit: `a40a9391af2d3a9c6cecc1511d82d238a56fc0e1`
- Worktree: clean at the implementation commit before this review-state record.
- Changed implementation files:
  - `packages/llm-core/src/features/specifications/factory.ts`
  - `packages/llm-core/src/features/specifications/public.ts`
  - `packages/llm-core/src/features/specifications/types.ts`
  - `packages/llm-core/src/features/specifications/validation.ts`
  - `packages/llm-core/tests/specifications/contracts.test.ts`
- Verification (all exit 0): `bun test packages/llm-core/tests/specifications`;
  `bun run typecheck:packages`; `bun run typecheck:tests`; `bun run lint`; and
  `git diff --check`.
- Applied ADRs: ADR-001, ADR-003, ADR-009, ADR-011 and ADR-012. No deviations.
- Remaining boundary: `SpecificationGraph` stays feature-internal, and no
  `./specifications` package export, runtime registration, compiler or source
  write-back is included. Those belong to the later compiler, authority and
  API tasks.
- No shared-file changes are requested from the integration owner.
