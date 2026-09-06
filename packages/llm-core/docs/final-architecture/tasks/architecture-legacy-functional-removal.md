---
id: architecture-legacy-functional-removal
title: Remove internal compatibility and dead source bloat
stage: architecture
status: done
priority: high
depends_on:
  - architecture-source-layout-normalization
  - language-rollout
decision_dependencies:
  - ADR-012
  - ADR-015
conflicts_with:
  - architecture-status-validation
  - runtime-tools-front-boundary
  - adapter-openspec-release
  - adapter-pydantic-ai-release
  - adapter-ai-sdlc-release
  - adapter-spec-kit-release
  - adapter-bmad-release
  - adapter-strands-runtime-release
  - applications-client-subpath-release
write_scope:
  - tsconfig.json
  - packages/llm-core/docs/final-architecture/STATUS.md
  - packages/llm-core/package.json
  - packages/llm-core/scripts/smoke-package.mjs
  - packages/llm-core/src/functional/index.ts
  - packages/llm-core/src/features/model/prompting.ts
  - packages/llm-core/tests/architecture/**
  - packages/llm-core/docs/final-architecture/tasks/architecture-legacy-functional-removal.md
required_reading:
  - path: packages/llm-core/docs/internal/REUSABLE-ABSTRACTION-REVIEW.md
    reason: "Apply the D01 dead-basis evidence without removing live MaybePromise composition."
read_scope:
  - packages/llm-core/docs/internal/REUSABLE-ABSTRACTION-REVIEW.md
  - packages/llm-core/package.json
  - packages/llm-core/scripts/build.ts
  - packages/llm-core/tsconfig.json
review_owner: coordinator
updated_at: 2026-09-06
---

# architecture-legacy-functional-removal — Remove internal compatibility and dead source bloat

## Objective

Complete ADR-012 by removing the dead `src/functional` barrel and workspace-only
TypeScript alias that still allow monorepo consumers to compile against the
retired `@geekist/llm-core/functional` surface. Apply the repository's
pre-compatibility policy to redundant package resolver fallbacks and remove
confirmed unreachable source rather than preserving speculative utility code.

## In scope

- Delete `packages/llm-core/src/functional/index.ts` and remove the root
  TypeScript path mapping.
- Remove redundant top-level package resolver fields superseded by the exact
  export map.
- Delete unexported, unreferenced model metadata sanitisation.
- Extend architecture tests so retired package subpaths are rejected in package
  exports, package/root TypeScript mappings and live source entry barrels.

## Out of scope

- Removing `MaybePromise`, functional helpers from `src/shared`, or changing any
  supported public runtime behavior.

## Acceptance criteria

- Neither source, package exports nor workspace path mappings expose
  `@geekist/llm-core/functional` or `./functional`.
- The package export map is the only package-resolution authority; redundant
  top-level `main`, `module` and `types` fields remain absent.
- Unreachable model metadata sanitisation is absent and no live source imports
  its retired symbols.
- Supported helpers remain private and existing sync/async behavior is unchanged.
- Complete architecture and release gates pass from a clean checkout.

## Verification

```sh
bun install --frozen-lockfile
bun test packages/llm-core/tests/architecture
bun run --cwd packages/llm-core release:build
bun run test:package
bun run --cwd packages/llm-core format:check
git diff --check
```

## Work log

Planned after deep Architecture v2 review.

2026-09-01 — Removed the retired functional barrel and root TypeScript alias,
the redundant top-level package resolver fields, and 71 lines of unreachable
model metadata sanitisation. Added architecture invariants across the manifest,
both TypeScript mapping surfaces and the source front. Focused architecture,
model, type, formatting and diff gates pass. The complete release build passed
801 tests with four existing optional external-adapter checks skipped; the
isolated packed consumer verified all 35 ESM-only exports.

2026-09-05 — Reconciled the stale lifecycle record against merged commit
`16fa377` on current `main` at `09761df`. Independent review found no current
implementation regression and identified one enforcement gap: the architecture
test rejected only the exact retired alias. The review correction parses both
JSONC TypeScript path maps, rejects the complete retired namespace, checks every
public runtime front for the former helper exports, and adds compile-time
negative imports for the base and descendant package subpaths. Final independent
re-review found no actionable findings. Focused architecture tests, test
typecheck, Prettier, scoped zero-warning ESLint and `git diff --check` pass.

2026-09-06 — The user authorised integration of the reviewed enforcement and
lifecycle correction. Reconciled the shared `STATUS.md` projection with the
LangGraph task, and the full package release build passed with 900 tests, four
optional skips and no failures.

## Handoff

The removal is merged in commit `16fa377`. This integration adds the stronger
architecture regression test and corrected lifecycle evidence. The generated
status, complete release build, package and test typechecks, formatting and
independent review are clean. Publication remains a separate task.
