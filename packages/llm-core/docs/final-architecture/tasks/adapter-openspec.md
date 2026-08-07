---
architecture_version: 2
id: adapter-openspec
title: OpenSpec file and CLI adapter
stage: adapters
status: done
evidence_milestone: cf3347d
priority: normal
preferred_owner_kind: codex
owner: codex-root
owner_kind: coordinator
lease_started_at:
lease_expires_at:
base_sha: 9920425
branch: main
worktree: /Users/jasonnathan/Repos/@theGeekist/llm-core
depends_on:
  - specification-api
decision_dependencies:
  - ADR-009
conflicts_with: []
write_scope:
  - packages/llm-core/src/adapters/openspec/**
  - packages/llm-core/tests/adapters/openspec/**
  - packages/llm-core/docs/final-architecture/tasks/adapter-openspec.md
required_reading:
  - path: context/aifsd-research/profiles/openspec.md
    reason: "Use the documented OpenSpec file and CLI contracts as source-format evidence."
  - path: packages/llm-core/docs/final-architecture/SPECIFICATIONS.md
    reason: "Preserve source authority and observation boundaries while treating loss support as historical."
read_scope:
  - context/aifsd-research/profiles/openspec.md
  - packages/llm-core/docs/final-architecture/SPECIFICATIONS.md
  - packages/llm-core/src/specifications/**
  - packages/llm-core/src/features/specifications/**
  - packages/llm-core/src/application/specification-compiler/**
review_owner: coordinator
updated_at: 2026-08-02
---

# adapter-openspec — OpenSpec file and CLI adapter

## Objective

Import supported OpenSpec roots, current specifications, change deltas and
lifecycle status without depending on undocumented internal package modules or
assuming that import authorizes execution.

## Deliverables

- Version detection and a support declaration for each accepted file/CLI
  contract.
- Source snapshots that distinguish roots, references, current truth, deltas,
  skipped artifacts and archived material.
- Stable source bindings for imported requirements, decisions, tasks and
  relationships.
- Explicit conversion and validation diagnostics.
- A coordinator handoff requesting conditional publication through adapter-openspec-release.

## Acceptance criteria

- Read-only references remain read-only and preserve their authority.
- Sync and archive are explicit lifecycle operations, never import side
  effects.
- Unsupported Markdown meaning is preserved or reported, never guessed away.
- The adapter uses only documented CLI/file contracts.
- OpenSpec types and lifecycle concepts do not escape the adapter boundary.
- Shared package metadata and packed-consumer expectations remain untouched;
  adapter-openspec-release owns publication.

## Verification

```sh
bun test packages/llm-core/tests/adapters/openspec
bun run typecheck:packages
bun run typecheck:tests
bun run lint
```

## Work log

- 2026-08-02 — User explicitly authorized parallel adapter implementation.
  `codex-root` owns the task lease and delegates only the adapter source/test
  paths to a child worker; package publication remains out of scope.
- 2026-08-02 — Implemented the uncommitted OpenSpec qualification slice in
  `src/adapters/openspec/` with focused fixtures in
  `tests/adapters/openspec/`. It accepts only documented 1.6.0 file/CLI JSON
  observations; current truth, deltas, archives, skipped material, and
  read-only references remain detached source-owned artifacts. No Markdown
  meaning is guessed; sync/archive/write-back are not implemented or claimed.
  Focused tests, package/test typechecks, lint, and package formatting pass.
- 2026-08-02 — Coordinator review passed after all remediation rounds. The
  reviewed implementation was committed on `main` at `cf3347d`; the full
  package baseline passed with 666 tests, 4 environment-gated skips, and no
  failures. Marked done; conditional publication remains separately gated.

## Handoff

Review passed for `cf3347d` (`feat(specifications): qualify framework
adapters`). OpenSpec remains unpublished; conditional publication is owned by
the separate `adapter-openspec-release` task.
