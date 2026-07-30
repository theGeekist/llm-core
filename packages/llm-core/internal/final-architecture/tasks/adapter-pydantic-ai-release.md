---
architecture_version: 2
id: adapter-pydantic-ai-release
title: Publish the qualified PydanticAI AgentSpec adapter
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
  - adapter-pydantic-ai
decision_dependencies:
  - ADR-007
  - ADR-009
  - ADR-010
conflicts_with:
  - adapter-openspec-release
  - adapter-ai-sdlc-release
  - adapter-spec-kit-release
  - adapter-bmad-release
write_scope:
  - packages/llm-core/package.json
  - packages/llm-core/scripts/build.ts
  - packages/llm-core/scripts/smoke-package.mjs
  - packages/llm-core/tsconfig.json
  - packages/llm-core/tsconfig.build.json
  - packages/llm-core/tests/architecture/**
  - docs/reference/package-exports.md
  - docs/reference/specification-adapters.md
  - packages/llm-core/internal/final-architecture/tasks/adapter-pydantic-ai-release.md
read_scope:
  - packages/llm-core/src/adapters/pydantic-ai-spec/**
  - packages/llm-core/tests/adapters/pydantic-ai-spec/**
review_owner: coordinator
updated_at: 2026-07-30
---

# adapter-pydantic-ai-release — Publish the qualified PydanticAI AgentSpec adapter

## Objective

Publish the independently verified PydanticAI projection adapter through the
conditionally approved `@geekist/llm-core/adapters/pydantic-ai-spec` front.

## Deliverables

- Package, build, declaration and source-resolution entries.
- Updated public-surface and package-smoke expectations.
- Public exact-version and projection-support documentation.
- Runtime and declaration verification from an isolated packed consumer.

## Acceptance criteria

- adapter-pydantic-ai conformance evidence is complete and pins the exact Python reference.
- The package root remains unchanged.
- Python/Pydantic values do not cross portable TypeScript fronts.
- The exact post-publication export count is recorded in package evidence.
- The complete package release, isolated consumer, documentation and formatting
  gates pass after publication.

## Verification

```sh
bun test packages/llm-core/tests/adapters/pydantic-ai-spec
bun test packages/llm-core/tests/conformance
bun test packages/llm-core/tests/architecture
bun run --cwd packages/llm-core release:build
bun run test:package
bun run docs:check
bun run --cwd packages/llm-core format:check
```

## Work log

Not started.

## Handoff

Pending.
