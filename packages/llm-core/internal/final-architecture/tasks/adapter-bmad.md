---
architecture_version: 2
id: adapter-bmad
title: BMAD file and CLI adapter
stage: adapters
status: done
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
  - packages/llm-core/src/adapters/bmad/**
  - packages/llm-core/tests/adapters/bmad/**
  - packages/llm-core/internal/final-architecture/tasks/adapter-bmad.md
read_scope:
  - packages/llm-core/src/specifications/**
  - /Users/jasonnathan/Repos/aifsd-agent-framework-research/profiles/bmad-method.md
review_owner: coordinator
updated_at: 2026-08-02
---

# adapter-bmad — BMAD file and CLI adapter

## Objective

Import supported BMAD planning artifacts and workflow status while preserving
stable identities, append-only records, source ownership and partial or blocked
outcomes.

## Deliverables

- Separately versioned file/CLI support declarations.
- Mapping for planning artifacts, stories, decisions, status and append-only
  memory records.
- Preservation and source-ownership diagnostics.
- Partial, blocked and repair-loop conformance fixtures.
- A coordinator handoff requesting conditional publication through adapter-bmad-release.

## Acceptance criteria

- Append-only records remain append-only evidence and are not collapsed into
  mutable node metadata.
- Stable source identities survive repeated imports.
- Partial and blocked outcomes remain distinct from success and rejection.
- File conventions are not misrepresented as a comprehensive stable runtime
  schema.
- Shared package metadata and packed-consumer expectations remain untouched;
  adapter-bmad-release owns publication.

## Verification

```sh
bun test packages/llm-core/tests/adapters/bmad
bun run typecheck:packages
bun run typecheck:tests
bun run lint
```

## Work log

- 2026-08-02 — User explicitly authorized parallel adapter implementation.
  `codex-root` owns the task lease and delegates research/design while retaining
  the adapter source/test integration; package publication remains out of scope.
- 2026-08-02 — Implemented the uncommitted BMAD 6.10.0 file/CLI observation
  slice in `src/adapters/bmad/` with focused fixtures in
  `tests/adapters/bmad/`. Stable artifact and append-only memory-record
  identities are preserved; `partial`, `blocked`, and `done` remain distinct
  source outcomes. The adapter does not parse arbitrary frontmatter, restore
  runtime state, write back, or claim a comprehensive runtime schema. Focused
  tests, package/test typechecks, lint, and package formatting pass.
- 2026-08-02 — Coordinator review passed after all remediation rounds. The
  reviewed implementation was committed on `main` at `cf3347d`; the full
  package baseline passed with 666 tests, 4 environment-gated skips, and no
  failures. Marked done; conditional publication remains separately gated.

## Handoff

Review passed for `cf3347d` (`feat(specifications): qualify framework
adapters`). BMAD remains unpublished; conditional publication is owned by the
separate `adapter-bmad-release` task.
