---
architecture_version: 2
id: P0-155
title: Resolve AI SDK 7 dependency and module-format gate
phase: P0.4
status: proposed
priority: P0
preferred_owner_kind: coordinator
owner: null
owner_kind: null
lease_started_at: null
lease_expires_at: null
base_sha: null
branch: null
worktree: null
depends_on:
  - P0-110
  - P0-120
decision_dependencies:
  - ADR-007
conflicts_with: []
write_scope:
  - package.json
  - packages/llm-core/package.json
  - packages/llm-core/scripts/build.ts
  - packages/llm-core/scripts/smoke-package.mjs
  - .github/workflows/ci.yml
  - .github/workflows/release.yml
  - packages/llm-core/internal/final-architecture/tasks/P0-155-ai-sdk7-packaging-gate.md
review_owner: human
updated_at: 2026-07-29
---

# P0-155 — Resolve AI SDK 7 Dependency and Module-Format Gate

## Objective

Apply the accepted runtime/module-format decision and establish a buildable,
evidence-backed packaging baseline for the isolated AI SDK 7 conversion.

## In scope

Package metadata, build and package-smoke implications, CI/runtime enforcement,
the exact AI SDK 7 package matrix, and the adapter isolation boundary approved
by ADR-007.

## Out of scope

AI SDK adapter implementation, the active manifest/lock upgrade to AI SDK 7,
and unrelated dependency upgrades. The active upgrade lands atomically with
P0-160 because the current AI SDK 5 adapter does not type-check against version 7.

## Acceptance criteria

- The package and workspace require Node.js `>=22`, and CI/release jobs exercise
  that supported baseline explicitly.
- The package is ESM-only: no CommonJS build, export condition or package-smoke
  path remains.
- A clean build removes stale `dist/cjs` and `.cjs` artifacts before packaging,
  and package smoke fails if either reappears.
- The exact direct AI SDK 7 package matrix and its isolation boundary are
  recorded for P0-160.
- Existing non-AI-SDK package smoke paths still build.
- P0-160 has a stable, reproducible dependency baseline without requiring a
  knowingly red intermediate commit.

## Verification

```sh
bun run build
bun run test:package
bun run typecheck:packages
```

## Work log

- 2026-07-29 — Pre-claim evidence confirmed no named CommonJS consumer across
  llm-core, aggressive-businesses or the framework-research workspace. All
  current consumers use ESM; the only runtime `require()` path is llm-core's
  self-authored package smoke.
- 2026-07-29 — AI SDK 7 package evidence selected Node.js `>=22` and ESM-only.
  The direct conversion matrix is `ai@7.0.37`,
  `@ai-sdk/provider@4.0.3`, `@ai-sdk/provider-utils@5.0.12`,
  `@ai-sdk/openai@4.0.20`, `@ai-sdk/anthropic@4.0.21`, and
  `@ai-sdk/react@4.0.40`. `@ai-sdk/gateway@4.0.28` is recorded when the adapter
  uses it directly.
- 2026-07-29 — Sequencing audit found that applying the dependency upgrade in
  this task would break the existing AI SDK 5 adapter (`system`,
  `fullStream`, and `totalUsage`) before P0-160 can convert it. The manifest and
  lock change therefore move atomically with P0-160; P0-155 lands the green
  runtime/module-format gate and records the exact matrix.

## Handoff
