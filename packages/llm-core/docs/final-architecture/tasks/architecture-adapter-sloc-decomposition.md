---
id: architecture-adapter-sloc-decomposition
title: Decompose legacy adapter modules above the hard SLOC boundary
stage: architecture
status: in_progress
priority: medium
depends_on:
  - architecture-source-layout-normalization
decision_dependencies:
  - ADR-007
  - ADR-015
conflicts_with:
  - adapter-openspec-release
  - adapter-pydantic-ai-release
  - adapter-spec-kit-release
write_scope:
  - packages/llm-core/src/adapters/openspec/**
  - packages/llm-core/src/adapters/pydantic-ai-spec/**
  - packages/llm-core/src/adapters/spec-kit/**
  - scripts/sloc-baseline.json
  - scripts/check-sloc.ts
  - scripts/quality/eslint-baseline.json
  - packages/llm-core/docs/final-architecture/STATUS.md
  - packages/llm-core/docs/final-architecture/tasks/architecture-adapter-sloc-decomposition.md
required_reading:
  - path: scripts/sloc-baseline.json
    reason: "Use the recorded waiver digests and ceilings as decomposition evidence."
read_scope:
  - scripts/sloc-baseline.json
  - packages/llm-core/src/adapters/openspec/**
  - packages/llm-core/src/adapters/pydantic-ai-spec/**
  - packages/llm-core/src/adapters/spec-kit/**
review_owner: coordinator
updated_at: 2026-10-20
---

# architecture-adapter-sloc-decomposition — Decompose legacy adapter modules

## Objective

Split the OpenSpec, PydanticAI specification and Spec Kit adapter modules whose
committed content exceeds the 600-line hard boundary, without changing their
qualified external contracts.

## In scope

- Decompose each waived source module into cohesive adapter-owned files.
- Preserve every exact operation, validator, fixture and published behaviour.
- Remove the three temporary hard-boundary waivers after decomposition.

## Out of scope

- Changing upstream authority, qualified versions or package exports.
- Combining the three independent adapter contracts.

## Acceptance criteria

- Every affected hand-written production module is at or below 600 physical
  lines, with the approximately-500 policy applied normally.
- Existing adapter, conformance, package and documentation suites pass.
- The three temporary hard-boundary waivers are removed.

## Verification

```sh
bun run check:sloc
bun run --cwd packages/llm-core release:build
bun run test:package
git diff --check
```

## Work log

Execution mode: dedicated-worktree
Execution checkout: `/workspace/scratch/6a7ca0febf9b/research/ci-audit-2026-10-20/llm-core` (receiving qualification); source extraction used sibling `llm-core-adapter-sloc`.
Execution rationale: Isolate the three legacy adapter decompositions from concurrent native-adapter lint repair, then verify their combined receiving tree.
Concurrency evaluation: native-adapter lint maintenance; start alongside because the adapter source paths are disjoint; coordinator owns combined quality verification.
Concurrent task scopes: native-adapter lint maintenance owns Claude native-session, Antigravity Sidecar and retired-subpath characterization; this task owns the three legacy adapters and their exact obsolete quality records.
Swarm delegation: coordinator -> adapter decomposition worker: bounded source extraction; independent reviewer: source equivalence and final diff review.

2026-10-20: Canonical CI exposed three hard-boundary waivers expired on
2026-09-06. Extracted cohesive adapter-owned modules without changing operation
or package export contracts. Removed only these three retired waiver entries,
their three obsolete legacy seals, and twelve obsolete lint records (seven
warnings and five suppressions); added no lint allowance and changed no size
threshold or guard algorithm.

Independent source review found no actionable issues. Focused adapter and SLOC tests
passed 104 tests with two existing exact-runtime skips; the packed consumer
verified 35 ESM-only exports. Receiving SLOC verification passes 676 modules.
The combined quality gate and exact pull-request checks remain pending.
Source and integration evidence are attached to
[quality repair PR #10](https://github.com/theGeekist/llm-core/pull/10).
This task remains in progress until qualification and merged source are verified.

## Handoff

Source extraction and independent review are complete. Receiving quality
qualification and merge verification remain pending. No temporary waiver was
renewed and no gate was relaxed.
