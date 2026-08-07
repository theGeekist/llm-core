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
  - architecture-source-layout-normalization
  - adapter-pydantic-ai
  - adapter-pydantic-ai-semantic-projection
  - specification-cross-adapter-conformance
  - architecture-release-reproducibility
decision_dependencies:
  - ADR-007
  - ADR-009
  - ADR-010
  - ADR-015
conflicts_with:
  - adapter-openspec-release
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
  - .github/workflows/release.yml
  - scripts/release-qualifiers.json
  - packages/llm-core/package.json
  - packages/llm-core/scripts/build.ts
  - packages/llm-core/scripts/smoke-package.mjs
  - packages/llm-core/tsconfig.json
  - packages/llm-core/tsconfig.build.json
  - packages/llm-core/tests/architecture/**
  - packages/llm-core/tests/adapters/pydantic-ai-spec/release-qualifier/**
  - docs/reference/package-exports.md
  - docs/reference/specification-adapters.md
  - packages/llm-core/docs/final-architecture/tasks/adapter-pydantic-ai-release.md
required_reading:
  - path: context/aifsd-research/profiles/pydantic-ai.md
    reason: "Preserve the exact AgentSpec and Python qualification boundary in publication."
  - path: docs/reference/package-exports.md
    reason: "Use the sealed export inventory as publication evidence."
read_scope:
  - context/aifsd-research/profiles/pydantic-ai.md
  - docs/reference/package-exports.md
  - packages/llm-core/src/adapters/pydantic-ai-spec/**
  - packages/llm-core/tests/adapters/pydantic-ai-spec/**
review_owner: coordinator
updated_at: 2026-08-03
---

# adapter-pydantic-ai-release — Publish the qualified PydanticAI AgentSpec adapter

## Objective

Publish the independently verified PydanticAI compilation adapter through the
conditionally approved `@geekist/llm-core/adapters/pydantic-ai-spec` front.

## Deliverables

- Package, build, declaration and source-resolution entries.
- Updated public-surface and package-smoke expectations.
- Public exact-version and compilation-support documentation.
- A support declaration naming the maintenance owner, PydanticAI `2.19.0` as
  the exact supported upstream version, the package-release support window and
  the deprecation policy.
- Runtime and declaration verification from an isolated packed consumer.
- A frozen, task-owned Python qualification environment and permanent release
  registration for the exact supported PydanticAI version.

## Acceptance criteria

- adapter-pydantic-ai conformance evidence is complete and pins the exact Python reference.
- The release gate fails when `LLM_CORE_PYDANTIC_AI_PYTHON` is absent, does not
  execute, or does not provide PydanticAI `2.19.0`; the named live fixture test
  must execute with zero skips.
- The task-owned qualifier pins Python and the complete PydanticAI 2.19.0
  environment with a frozen lock, provisions it in the tagged workflow and
  supplies its interpreter to every live adapter/conformance test. The
  registered qualifier treats a skipped live test as failure.
- The package root remains unchanged.
- Python/Pydantic values do not cross portable TypeScript fronts.
- The exact post-publication export count is recorded in package evidence.
- The complete package release, isolated consumer, documentation and formatting
  gates pass after publication.
- Publication commits the project to supporting PydanticAI `2.19.0` for the
  documented package-release window under a named maintenance owner and
  deprecation policy. Later PydanticAI versions remain demand-led and require
  fresh qualification.
- A simulated later package release proves that removing the Python runtime,
  changing the pinned PydanticAI version or skipping the live fixture blocks
  the canonical release command.

## Verification

```sh
bun run check:sloc
bun run qualify:external-fixtures
bun run --cwd packages/llm-core/tests/adapters/pydantic-ai-spec/release-qualifier qualify
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
exact version and package-release window.

## Handoff

Pending.
