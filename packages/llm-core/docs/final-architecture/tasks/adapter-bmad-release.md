---
architecture_version: 2
id: adapter-bmad-release
title: Publish the qualified BMAD adapter
stage: adapters
status: proposed
priority: normal
preferred_owner_kind: coordinator
owner:
owner_kind:
lease_started_at:
lease_expires_at:
base_sha:
branch:
worktree:
depends_on:
  - architecture-source-layout-normalization
  - adapter-bmad
  - specification-cross-adapter-conformance
  - architecture-release-reproducibility
decision_dependencies:
  - ADR-007
  - ADR-009
  - ADR-010
  - ADR-015
conflicts_with:
  - adapter-openspec-release
  - adapter-pydantic-ai-release
  - adapter-ai-sdlc-release
  - adapter-spec-kit-release
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
  - packages/llm-core/docs/final-architecture/tasks/adapter-bmad-release.md
read_scope:
  - packages/llm-core/src/adapters/bmad/**
  - packages/llm-core/tests/adapters/bmad/**
review_owner: coordinator
updated_at: 2026-08-03
---

# adapter-bmad-release — Publish the qualified BMAD adapter

## Objective

Publish the independently verified BMAD adapter through the conditionally
approved `@geekist/llm-core/adapters/bmad` front.

## Deliverables

- Package, build, declaration and source-resolution entries.
- Updated public-surface and package-smoke expectations.
- Public file/CLI, preservation and outcome-support documentation.
- Runtime and declaration verification from an isolated packed consumer.
- A durable qualifier registration for the declared BMAD contract/window.
- A recorded support-demand case and support declaration naming the maintenance
  owner, exact file/CLI contract versions, package-release support window and
  deprecation policy.

## Acceptance criteria

- adapter-bmad conformance evidence is complete and names exact file/CLI contracts.
- The package root remains unchanged.
- Append-only evidence and partial/blocked outcomes retain their semantics.
- The exact post-publication export count is recorded in package evidence.
- The complete package release, isolated consumer, documentation and formatting
  gates pass after publication.
- The canonical release gate executes the registered BMAD qualifier on every
  later package release and fails if it is absent, skipped or failing.
- Publication is withheld unless current consumer demand justifies ongoing
  file/CLI conformance maintenance.
- Once published, the declared exact file/CLI contracts are supported for the
  documented package-release window under the named maintenance owner and
  deprecation policy. Later versions remain demand-led and require fresh
  qualification.

## Verification

```sh
bun run check:sloc
bun run qualify:external-fixtures
bun test packages/llm-core/tests/adapters/bmad
bun test packages/llm-core/tests/architecture
bun run --cwd packages/llm-core release:build
bun run test:package
bun run docs:check
bun run --cwd packages/llm-core format:check
bun run release:qualify:llm-core
```

## Work log

Qualified internally; held behind the ADR-015 demand and maintenance gate. Not
started.

## Handoff

Pending.
