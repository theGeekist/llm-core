---
id: adapter-spec-kit
title: Spec Kit file and CLI adapter
stage: adapters
status: done
evidence_milestone: cf3347d
priority: normal
depends_on:
  - specification-api
decision_dependencies:
  - ADR-009
conflicts_with: []
write_scope:
  - packages/llm-core/src/adapters/spec-kit/**
  - packages/llm-core/tests/adapters/spec-kit/**
  - packages/llm-core/docs/final-architecture/tasks/adapter-spec-kit.md
required_reading:
  - path: context/aifsd-research/profiles/spec-kit.md
    reason: "Use the researched file, CLI, overlay and workflow semantics as source-format evidence."
  - path: packages/llm-core/docs/final-architecture/SPECIFICATIONS.md
    reason: "Preserve workflow-program and source-authority distinctions while treating loss support as historical."
  - path: packages/llm-core/docs/final-architecture/EXTERNAL-CONTRACT-FIDELITY-IMPACT.md
    reason: "Treat this task's loss-based wording as historical and apply the current exact-contract correction."
read_scope:
  - context/aifsd-research/profiles/spec-kit.md
  - packages/llm-core/docs/final-architecture/SPECIFICATIONS.md
  - packages/llm-core/docs/final-architecture/EXTERNAL-CONTRACT-FIDELITY-IMPACT.md
  - packages/llm-core/src/specifications/**
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
- 2026-08-02 — Coordinator review passed after all remediation rounds,
  including native overlay winner/conflict and duplicate-ID validation. The
  reviewed implementation was committed on `main` at `cf3347d`; the full
  package baseline passed with 666 tests, 4 environment-gated skips, and no
  failures. Marked done; conditional publication remains separately gated.

## Handoff

Review passed for `cf3347d` (`feat(specifications): qualify framework
adapters`). Spec Kit remains unpublished; conditional publication is owned by
the separate `adapter-spec-kit-release` task.
