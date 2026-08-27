---
id: architecture-legacy-functional-removal
title: Remove the retired functional workspace alias
stage: architecture
status: proposed
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
  - packages/llm-core/src/functional/index.ts
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
updated_at: 2026-08-02
---

# architecture-legacy-functional-removal — Remove the retired functional workspace alias

## Objective

Complete ADR-012 by removing the dead `src/functional` barrel and workspace-only
TypeScript alias that still allow monorepo consumers to compile against the
retired `@geekist/llm-core/functional` surface.

## In scope

- Delete `packages/llm-core/src/functional/index.ts` and remove the root
  TypeScript path mapping.
- Extend architecture tests so retired package subpaths are rejected in package
  exports, package/root TypeScript mappings and live source entry barrels.

## Out of scope

- Removing `MaybePromise`, functional helpers from `src/shared`, or changing any
  supported public runtime behavior.

## Acceptance criteria

- Neither source, package exports nor workspace path mappings expose
  `@geekist/llm-core/functional` or `./functional`.
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

Planned after deep Architecture v2 review; not claimed.

## Handoff

Pending.
