---
id: architecture-test-sloc-decomposition
title: Decompose legacy runner test modules above the hard SLOC boundary
stage: architecture
status: proposed
priority: medium
depends_on:
  - architecture-runtime-ownership-correction
decision_dependencies:
  - ADR-007
  - ADR-016
conflicts_with: []
write_scope:
  - packages/llm-core/tests/application/agent/local-runner*.test.ts
  - packages/llm-core/tests/application/agent/model-tool-program*.test.ts
  - packages/llm-core/tests/support/**
  - scripts/sloc-baseline.json
  - scripts/quality/eslint-baseline.json
  - packages/llm-core/docs/final-architecture/tasks/architecture-test-sloc-decomposition.md
required_reading:
  - path: scripts/sloc-baseline.json
    reason: "Use the recorded waiver digests and ceilings as decomposition evidence."
read_scope:
  - scripts/sloc-baseline.json
  - scripts/quality/eslint-baseline.json
worktree: /private/tmp/llm-core-sloc-publication-20260905
review_owner: coordinator
updated_at: 2026-08-08
---

# architecture-test-sloc-decomposition — Decompose legacy runner tests above the hard SLOC boundary

## Objective

Split the two changed runner proof suites that exceed the 600-line hard boundary
into focused modules without weakening their conformance evidence.

## In scope

- Decompose the local-runner and model-tool-program suites into
  capability-focused test modules at or below the 600-line hard boundary.
- Preserve all proof behavior and test-support ownership introduced by
  `architecture-runtime-ownership-correction`.
- Remove the temporary versioned SLOC waivers after decomposition.

## Out of scope

- Moving proof executors back into production source.
- Changing public package contracts or adding a default runtime.
- Changing the tested runner, pause/resume or workflow semantics.

## Acceptance criteria

- Every affected hand-written test module is at or below 600 physical lines.
- The two temporary hard-boundary SLOC waivers are removed.
- Runner and controlled-workflow proof counts and behavior remain intact.
- The package qualification suite passes.

## Verification

```sh
bun run check:sloc
bun run release:qualify:llm-core
```

## Work log

Execution mode: shared-checkout

Execution rationale: The coordinator assigned this bounded test decomposition in
canonical `main` at `89f13143f97b644b3714e66ce88db7398ce3e432`.

Concurrency evaluation: start alongside Antigravity CLI hooks and Claude native
session adapter work; their source, tests and task records are disjoint and were
left untouched. The coordinator approved the expanded test filename patterns
and scoped ESLint baseline edits required by this decomposition.

Swarm delegation: none; independent review belongs to the coordinator.

- Split runner proofs into lifecycle/identity, controls/interventions, and
  delegation/resume modules; split model/tool proofs into tool execution,
  subagent declaration, and conversation/redaction modules.
- Extracted reusable setup into `tests/support/local-runner-fixtures.ts` and
  `tests/support/model-tool-program-fixtures.ts`. All eight modules are below
  300 physical lines, against the 500-line target and 600-line hard boundary.
- Removed both expired SLOC waivers while retaining their immutable sealed
  baseline provenance. Removed two resolved lint suppressions and six resolved
  nested-callback warnings from the sealed ESLint baseline; no allowances,
  exclusions or thresholds were added. Subagent cases are top-level tests in
  their dedicated module, removing redundant callback nesting.
- Before and after focused qualification: 55 runner/model-tool/controlled-workflow
  tests passed with 165 assertions. All 36 original test declaration token
  streams are unchanged after formatting and relocation.
- Strict scoped ESLint passed with zero warnings; the owning package test compiler
  options applied to the six suites and imported fixtures reported zero diagnostics.
- The designated worktree is for qualification of the committed scoped change
  only. The coordinator creates it from the reviewed commit so concurrent
  adapter work remains untouched during full package gates and publication.
- Full package typechecking encountered unfinished Antigravity adapter imports;
  full SLOC scanning encountered the separate `.claude/worktrees` checkout.
  These concurrent-work errors are outside this change. The coordinator owns
  clean committed-tree package and publication qualification.

## Handoff

Review-ready scoped test decomposition. Runtime source and public contracts are
unchanged. The coordinator retains lifecycle/STATUS, staging, commit and push
ownership. Focused commands use the six `local-runner*.test.ts` and
`model-tool-program*.test.ts` files plus `tests/application/workflow`; strict
scoped ESLint uses those suites and both new support fixtures.
