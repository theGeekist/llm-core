---
architecture_version: 2
id: X1-400
title: OpenSpec file and CLI adapter
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
  - packages/llm-core/src/adapters/openspec/**
  - packages/llm-core/tests/adapters/openspec/**
  - packages/llm-core/internal/final-architecture/tasks/X1-400-openspec-adapter.md
read_scope:
  - packages/llm-core/src/specifications/**
  - packages/llm-core/src/features/specifications/**
  - packages/llm-core/src/application/specification-compiler/**
  - /Users/jasonnathan/Repos/aifsd-agent-framework-research/profiles/openspec.md
review_owner: coordinator
updated_at: 2026-07-30
---

# X1-400 — OpenSpec file and CLI adapter

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
- A coordinator handoff requesting conditional publication through X1-405.

## Acceptance criteria

- Read-only references remain read-only and preserve their authority.
- Sync and archive are explicit lifecycle operations, never import side
  effects.
- Unsupported Markdown meaning is preserved or reported, never guessed away.
- The adapter uses only documented CLI/file contracts.
- OpenSpec types and lifecycle concepts do not escape the adapter boundary.
- Shared package metadata and packed-consumer expectations remain untouched;
  X1-405 owns publication.

## Verification

```sh
bun test packages/llm-core/tests/adapters/openspec
bun run typecheck:packages
bun run typecheck:tests
bun run lint
```

## Work log

Not started.

## Handoff

Pending.
