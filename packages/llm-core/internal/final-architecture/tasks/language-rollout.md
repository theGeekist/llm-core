---
architecture_version: 2
id: language-rollout
title: Atomic public-language rollout
stage: language
status: proposed
priority: critical
preferred_owner_kind: coordinator
owner:
owner_kind: codex
lease_started_at:
lease_expires_at:
base_sha:
branch:
worktree:
depends_on:
  - language-vocabulary
decision_dependencies:
  - ADR-011
  - ADR-012
conflicts_with: []
write_scope:
  - packages/llm-core/src/**
  - packages/llm-core/tests/**
  - packages/llm-core/index.ts
  - packages/llm-core/package.json
  - packages/llm-core/scripts/**
  - packages/llm-core/tsconfig*.json
  - packages/llm-core/README.md
  - README.md
  - docs/**
  - examples/**
  - packages/llm-core/internal/final-architecture/tasks/language-rollout.md
read_scope:
  - packages/llm-core/**
  - docs/**
review_owner: coordinator
updated_at: 2026-07-31
---

# language-rollout — Atomic public-language rollout

## Objective

Replace the source surface, package entrypoints, public exports, examples and
documentation with the exact ADR-012 language as one atomic integration.
Preserve every runtime, security and durability guarantee and never leave the
main branch with a deliberately broken release build.

## Acceptance criteria

- Language fixtures compile through the real package root and subpath exports.
- Common fronts no longer aggregate unrelated capability internals.
- Common agent, tool, workflow and conversation journeys hide preparation,
  binding, registration and projection mechanics.
- Extension contracts remain explicit and testable.
- All package-internal call sites, tests, examples and snippets use the new
  names.
- Portable contract changes follow the schema/version decision from language-vocabulary.
- The workspace README, package README, guides, vocabulary, API reference,
  migration map and diagrams use the exact language.
- Runtime and declaration imports pass from an isolated packed consumer.
- Package exports expose no stale aliases or unintended deep surfaces.
- `specification-contracts` can begin without inventing unresolved public
  terminology.

## Verification

```sh
bun run lint
bun run --cwd packages/llm-core release:build
bun run test:package
bun run docs:check
bun run --cwd packages/llm-core format:check
bun run typecheck:packages
bun run typecheck:tests
bun run test
bun run typecheck:examples
```

## Work log

Not started.

## Handoff

Pending.
