---
architecture_version: 2
id: X1-440
title: BMAD file and CLI adapter
phase: X1
status: proposed
priority: P2
preferred_owner_kind: codex
owner:
owner_kind:
lease_started_at:
lease_expires_at:
base_sha:
branch:
worktree:
depends_on:
  - P2-320
decision_dependencies:
  - ADR-009
conflicts_with: []
write_scope:
  - packages/llm-core/src/adapters/bmad/**
  - packages/llm-core/tests/adapters/bmad/**
  - packages/llm-core/internal/final-architecture/tasks/X1-440-bmad-adapter.md
read_scope:
  - packages/llm-core/src/specifications/**
  - /Users/jasonnathan/Repos/aifsd-agent-framework-research/profiles/bmad-method.md
review_owner: coordinator
updated_at: 2026-07-30
---

# X1-440 — BMAD file and CLI adapter

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
- A coordinator handoff requesting conditional publication through X1-445.

## Acceptance criteria

- Append-only records remain append-only evidence and are not collapsed into
  mutable node metadata.
- Stable source identities survive repeated imports.
- Partial and blocked outcomes remain distinct from success and rejection.
- File conventions are not misrepresented as a comprehensive stable runtime
  schema.
- Shared package metadata and packed-consumer expectations remain untouched;
  X1-445 owns publication.

## Verification

```sh
bun test packages/llm-core/tests/adapters/bmad
bun run typecheck:packages
bun run typecheck:tests
bun run lint
```

## Work log

Not started.

## Handoff

Pending.
