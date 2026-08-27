---
id: adapter-openspec-release
title: Publish the qualified OpenSpec adapter
stage: adapters
status: proposed
priority: normal
depends_on:
  - architecture-source-layout-normalization
  - adapter-openspec
  - specification-cross-adapter-conformance
  - architecture-release-reproducibility
decision_dependencies:
  - ADR-007
  - ADR-009
  - ADR-010
  - ADR-015
conflicts_with:
  - architecture-adapter-sloc-decomposition
  - adapter-pydantic-ai-release
  - adapter-ai-sdlc-release
  - adapter-spec-kit-release
  - adapter-bmad-release
  - adapter-strands-runtime-release
  - runtime-tools-front-boundary
  - architecture-status-validation
  - adapter-strands-runtime
  - runtime-temporal-reference
  - adapters-protocol-qualification
  - applications-client-subpath-release
  - architecture-legacy-functional-removal
write_scope:
  - scripts/release-qualifiers.json
  - packages/llm-core/package.json
  - packages/llm-core/scripts/build.ts
  - packages/llm-core/scripts/smoke-package.mjs
  - packages/llm-core/tsconfig.json
  - packages/llm-core/tsconfig.build.json
  - packages/llm-core/tests/architecture/**
  - docs/reference/package-exports.md
  - docs/reference/specification-adapters.md
  - packages/llm-core/docs/final-architecture/tasks/adapter-openspec-release.md
required_reading:
  - path: context/aifsd-research/profiles/openspec.md
    reason: "Preserve the exact source contract and fixture versions in publication."
  - path: docs/reference/package-exports.md
    reason: "Use the sealed export inventory as publication evidence."
read_scope:
  - context/aifsd-research/profiles/openspec.md
  - docs/reference/package-exports.md
  - packages/llm-core/src/adapters/openspec/**
  - packages/llm-core/tests/adapters/openspec/**
review_owner: coordinator
updated_at: 2026-08-03
---

# adapter-openspec-release — Publish the qualified OpenSpec adapter

## Objective

Publish the independently verified OpenSpec adapter through the conditionally
approved `@geekist/llm-core/adapters/openspec` front.

## Deliverables

- Package, build, declaration and source-resolution entries.
- Updated public-surface and package-smoke expectations.
- Public support-level and source-lifecycle documentation.
- A support declaration naming the maintenance owner, exact OpenSpec contract
  and fixture versions, package-release support window and deprecation policy.
- Runtime and declaration verification from an isolated packed consumer.
- A durable qualifier registration for the declared OpenSpec contract/window.

## Acceptance criteria

- adapter-openspec conformance evidence is complete and names exact supported contracts.
- The package root remains unchanged.
- No undocumented OpenSpec dependency or type leaks through another front.
- The exact post-publication export count is recorded in package evidence.
- The complete package release, isolated consumer, documentation and formatting
  gates pass after publication.
- The canonical release gate executes the registered OpenSpec qualifier on
  every later package release and fails if it is absent, skipped or failing.
- Publication commits the project to supporting the declared exact OpenSpec
  contracts for the documented package-release window under the named owner
  and deprecation policy. Later contract versions remain demand-led and require
  fresh qualification.

## Verification

```sh
bun run check:sloc
bun run qualify:external-fixtures
bun test packages/llm-core/tests/adapters/openspec
bun test packages/llm-core/tests/architecture
bun run --cwd packages/llm-core release:build
bun run test:package
bun run docs:check
bun run --cwd packages/llm-core format:check
bun run release:qualify:llm-core
```

## Work log

Preferred first publication pair under ADR-015. Not started; qualification does
not itself authorize publication. Publication begins support for the declared
exact contracts and package-release window.

## Handoff

Pending.
