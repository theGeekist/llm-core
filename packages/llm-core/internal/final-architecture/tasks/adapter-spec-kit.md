---
architecture_version: 2
id: adapter-spec-kit
title: Spec Kit file and CLI adapter
stage: adapters
status: in_progress
priority: normal
preferred_owner_kind: codex
owner: codex-root
owner_kind: coordinator
lease_started_at: 2026-08-02T06:07:24.000Z
lease_expires_at: 2026-08-02T14:07:24.000Z
base_sha: 9920425
branch: main
worktree: /Users/jasonnathan/Repos/@theGeekist/llm-core
depends_on:
  - specification-api
decision_dependencies:
  - ADR-009
conflicts_with: []
write_scope:
  - packages/llm-core/src/adapters/spec-kit/**
  - packages/llm-core/tests/adapters/spec-kit/**
  - packages/llm-core/internal/final-architecture/tasks/adapter-spec-kit.md
read_scope:
  - packages/llm-core/src/specifications/**
  - /Users/jasonnathan/Repos/aifsd-agent-framework-research/profiles/spec-kit.md
review_owner: coordinator
updated_at: 2026-08-02
---

# adapter-spec-kit — Spec Kit file and CLI adapter

## Objective

Import supported Spec Kit constitutions, specifications, plans, tasks and local
workflow state while preserving overlays and control flow richer than a DAG.

## Deliverables

- Separately versioned file/CLI support declarations.
- Mapping for constitutions, overlays, requirements, plans, tasks and workflow
  programs.
- Branch, join, bounded-loop and review-gate conformance fixtures.
- Source ownership and conversion-loss diagnostics.
- A coordinator handoff requesting conditional publication through adapter-spec-kit-release.

## Acceptance criteria

- Constitutions and overlays retain their precedence and source authority.
- Workflow loops are not flattened into dependency edges.
- Local resumable workflow state is not represented as a durable
  `llm-core` execution checkpoint without an explicit portable mapping.
- The adapter does not claim a stable comprehensive runtime schema where none
  is published.
- Shared package metadata and packed-consumer expectations remain untouched;
  adapter-spec-kit-release owns publication.

## Verification

```sh
bun test packages/llm-core/tests/adapters/spec-kit
bun run typecheck:packages
bun run typecheck:tests
bun run lint
```

## Work log

- 2026-08-02 — User explicitly authorized parallel adapter implementation.
  `codex-root` owns the task lease and works only inside this task's source and
  test scope; package publication remains out of scope.
- 2026-08-02 — Implemented the uncommitted Spec Kit 0.14.3-dev file/CLI
  observation slice in `src/adapters/spec-kit/` with focused fixtures in
  `tests/adapters/spec-kit/`. Constitutions and overlays retain source order;
  control programs retain branches, joins, gates, and loops as namespaced
  source data rather than DAG edges; local state remains an explicit degraded
  non-checkpoint observation. Focused tests, package/test typechecks, lint,
  and package formatting pass.

## Handoff

Uncommitted implementation is ready for coordinator review. No package,
build, documentation, root-export, or packed-consumer file changed. Conditional
publication remains the separate `adapter-spec-kit-release` task.
