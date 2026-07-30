---
architecture_version: 2
id: core-ai-sdk-packaging
legacy_id: P0-155
title: Resolve AI SDK 7 dependency and module-format gate
stage: core
status: done
priority: critical
preferred_owner_kind: coordinator
owner: codex-root
owner_kind: codex
lease_started_at: 2026-07-29T19:15:00+08:00
lease_expires_at: null
base_sha: 6b9838c
branch: task/P0-155-codex
worktree: /Users/jasonnathan/Repos/@theGeekist/llm-core/.worktrees/P0-155-codex
depends_on:
  - core-tool-control-events
  - core-model-runtime
decision_dependencies:
  - ADR-007
conflicts_with: []
write_scope:
  - package.json
  - packages/llm-core/package.json
  - packages/llm-core/scripts/build.ts
  - packages/llm-core/scripts/smoke-package.mjs
  - .github/workflows/ci.yml
  - .github/workflows/docs.yml
  - .github/workflows/release.yml
  - packages/llm-core/internal/final-architecture/tasks/core-ai-sdk-packaging.md
review_owner: human
updated_at: 2026-07-29
---

# core-ai-sdk-packaging — Resolve AI SDK 7 Dependency and Module-Format Gate

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
core-ai-sdk-adapter because the current AI SDK 5 adapter does not type-check against version 7.

## Acceptance criteria

- The package and workspace require Node.js `>=22`, and CI/release jobs exercise
  that supported baseline explicitly.
- The package is ESM-only: no CommonJS build, export condition or package-smoke
  path remains.
- A clean build removes stale `dist/cjs` and `.cjs` artifacts before packaging,
  and package smoke fails if either reappears.
- Package smoke asserts that every manifest target is ESM, no export or script
  contains a CommonJS path/condition, and a seeded stale CJS artifact is removed
  by the build.
- The exact direct AI SDK 7 package matrix and its isolation boundary are
  recorded for core-ai-sdk-adapter.
- Existing non-AI-SDK package smoke paths still build.
- core-ai-sdk-adapter has a stable, reproducible dependency baseline without requiring a
  knowingly red intermediate commit.
- core-convergence treats the Node/ESM break as a major-release gate before publication.

## Verification

```sh
bun run build
bun run test:package
bun run lint
bun run typecheck:packages
```

## Work log

- 2026-07-29 — Pre-claim evidence confirmed no named CommonJS consumer across
  llm-core, aggressive-businesses or the framework-research workspace. All
  current consumers use ESM; the only runtime `require()` path is llm-core's
  self-authored package smoke.
- 2026-07-29 — AI SDK 7 package evidence selected Node.js `>=22` and ESM-only.
  The provider conversion matrix is `ai@7.0.37`,
  `@ai-sdk/provider@4.0.3`, `@ai-sdk/provider-utils@5.0.12`,
  `@ai-sdk/openai@4.0.20`, and `@ai-sdk/anthropic@4.0.21`. The UI compatibility
  matrix includes `@ai-sdk/react@4.0.40`. `@ai-sdk/gateway@4.0.28` remains
  transitive unless core-ai-sdk-adapter imports it directly.
- 2026-07-29 — Sequencing audit found that applying the dependency upgrade in
  this task would break the existing AI SDK 5 adapter (`system`,
  `fullStream`, and `totalUsage`) before core-ai-sdk-adapter can convert it. The manifest and
  lock change therefore move atomically with core-ai-sdk-adapter, whose scope includes all
  currently compiled AI SDK provider/UI compatibility code. core-ai-sdk-packaging lands the
  green runtime/module-format gate and records the exact matrix.
- 2026-07-29 — Legacy AI SDK 4/5/6 generations pulled transitively by qualified
  framework integrations may coexist in the lock. core-ai-sdk-adapter asserts the direct
  adapter baseline, removes the current direct AI 5/React 2 overrides, and does
  not apply a global AI SDK 7 override.
- 2026-07-29T19:15:00+08:00 — Claimed by the Codex coordinator for delegated
  subagent execution after core-model-runtime integrated.
- 2026-07-29 — Worker moved the task to `in_progress` and began the scoped
  Node.js 22 / ESM-only packaging conversion.
- 2026-07-29 — Implemented and verified the packaging gate at `09382ad`.
  Workspace and package engines now require Node.js 22, all six CI/docs/release
  jobs select Node.js 22, and package output is ESM-only with deterministic
  stale-output cleanup.
- 2026-07-29 — Package smoke now recursively validates export targets, rejects
  CommonJS conditions/scripts/artifacts, checks the live Node baseline, retains
  dependency/alias checks, seeds both nested and root stale `.cjs` artifacts,
  runs the real package build, and imports every unique ESM runtime target.
  Moved to `review` after all required verification passed.
- 2026-07-29T19:27:00+08:00 — Integrated on main through `23f88ee`.
  Coordinator receiving verification passed frozen install, build, package
  smoke, lint, package typecheck and schema checks. Task marked complete.

## Handoff

Status: complete.

### Commits

- Implementation: `09382ad` (`build: enforce Node 22 ESM packaging`)
- The task branch is clean at that implementation commit before this
  handoff-only status update.

### Changed files

- `.github/workflows/ci.yml`
- `.github/workflows/docs.yml`
- `.github/workflows/release.yml`
- `package.json`
- `packages/llm-core/package.json`
- `packages/llm-core/scripts/build.ts`
- `packages/llm-core/scripts/smoke-package.mjs`
- `packages/llm-core/internal/final-architecture/tasks/core-ai-sdk-packaging.md`

### Verification

- `bun run build` — exit 0.
- `bun run test:package` — exit 0; loaded 15 unique ESM runtime targets from
  15 exports and proved both seeded CommonJS artifacts were removed.
- `bun run lint` — exit 0.
- `bun run typecheck:packages` — exit 0 after installing the unchanged frozen
  dependency graph; package typecheck and contract-schema freshness passed.
- Targeted manifest/workflow assertion — exit 0; root and package engines are
  `>=22`, all 6 workflow jobs select Node.js 22, and no CommonJS manifest
  surface remains.
- Targeted build/dist assertion — exit 0; no CommonJS build branch or built
  artifact remains.
- `git diff --check` — exit 0.

### Decision and dependency posture

- Applied ADR-007 without deviation: Node.js `>=22`, ESM-only publication, and
  no speculative CommonJS compatibility.
- Did not change `bun.lock` or any active AI SDK dependency. core-ai-sdk-adapter retains the
  atomic upgrade to the recorded AI SDK 7 provider/UI matrix.
- No shared-file changes are requested.

### Remaining risks and known semantic loss

- This is an intentional major-release compatibility break for CommonJS and
  Node.js versions below 22; core-convergence must retain it as a publication gate.
- The AI SDK 7 matrix is recorded but deliberately not exercised until core-ai-sdk-adapter,
  avoiding a knowingly red intermediate dependency state.
