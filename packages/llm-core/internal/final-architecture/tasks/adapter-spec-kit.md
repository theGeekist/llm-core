---
architecture_version: 2
id: adapter-spec-kit
title: Spec Kit file and CLI adapter
stage: adapters
status: proposed
priority: normal
preferred_owner_kind: codex
owner:
owner_kind:
lease_started_at:
lease_expires_at:
base_sha:
branch:
worktree:
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
updated_at: 2026-07-30
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

Not started.

## Handoff

Pending.
