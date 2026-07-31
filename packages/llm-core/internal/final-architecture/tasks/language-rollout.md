---
architecture_version: 2
id: language-rollout
title: Atomic public-language rollout
stage: language
status: review
priority: critical
preferred_owner_kind: coordinator
owner: codex-root
owner_kind: codex
lease_started_at: 2026-07-31T06:00:00+08:00
lease_expires_at: 2026-08-01T06:00:00+08:00
base_sha: 17d2b38a
branch: main
worktree: /Users/jasonnathan/Repos/@theGeekist/llm-core
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

- The implemented Agent, Tool, Workflow and Conversation fixtures compile
  through the real package root and subpath exports. The Specification fixture
  remains a checked desired contract until the specifications stage implements
  it, then becomes a compile gate in specification-api.
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

2026-07-31 — Claimed after ADR-012 passed coordinator review at `17d2b38`.
Implementation was divided into disjoint Agent/Tool, Workflow and Conversation
workstreams; the coordinator owns root/package/build integration.

2026-07-31 — Converged all common journeys, qualified runtime and capability
fronts, internal call sites, tests, examples, snippets, both READMEs and the
published documentation. The coordinator removed accidental capability
aggregation from `agent/runtime` and preserved the 731-export inventory as
explicit pre-rollout evidence at `17d2b38`.

2026-07-31 — Verification passed: lint and format checks; package, test,
example and snippet typechecks; 522 tests with one optional live PydanticAI
runtime check skipped; schema freshness; release build; 41-page production
documentation build; 22 Mermaid diagrams rendered in Chromium; and all 29 ESM
runtime and declaration exports loaded from an isolated packed consumer.

## Handoff

Ready for coordinator review. The rollout is deliberately breaking: stale
aliases and the `./functional` subpath were removed. The package root now
contains only the four implemented common journeys—Agent, Tool, Workflow and
Conversation—while runtime, capability and adapter contracts use explicit
qualified fronts.
