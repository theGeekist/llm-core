---
architecture_version: 2
id: adapter-strands-runtime-release
title: Publish qualified Strands runtime adapter
stage: adapters
status: proposed
priority: medium
preferred_owner_kind: coordinator
owner:
owner_kind:
lease_started_at:
lease_expires_at:
base_sha:
branch:
worktree:
depends_on:
  - adapter-strands-runtime
decision_dependencies:
  - ADR-007
  - ADR-013
conflicts_with:
  - adapter-openspec-release
  - adapter-pydantic-ai-release
  - adapter-ai-sdlc-release
  - adapter-spec-kit-release
  - adapter-bmad-release
  - runtime-temporal-reference
  - adapters-protocol-qualification
write_scope:
  - packages/llm-core/package.json
  - packages/llm-core/scripts/build.ts
  - packages/llm-core/tsconfig.json
  - packages/llm-core/tsconfig.build.json
  - packages/llm-core/tests/architecture/**
  - packages/llm-core/tests/package/**
  - docs/adapters/**
  - packages/llm-core/internal/final-architecture/tasks/adapter-strands-runtime-release.md
read_scope:
  - packages/llm-core/src/adapters/runtimes/strands/**
  - packages/llm-core/tests/adapters/runtimes/strands/**
  - packages/llm-core/tests/conformance/strands/**
review_owner: coordinator
updated_at: 2026-08-01
---

# adapter-strands-runtime-release — Publish qualified Strands runtime adapter

## Objective

Publish a qualified Strands runtime front only after adapter conformance,
support declarations and documentation make its exact boundary truthful.

## Acceptance criteria

- The new qualified subpath exposes only portable contracts plus the documented
  native boundary and does not change the root package entry.
- Runtime and declaration imports pass in an isolated packed consumer.
- Documentation names the exact Strands versions, support level, known loss,
  Python/TypeScript scope and durability posture.
- Release build, package smoke, documentation and formatting gates pass.

## Verification

```sh
bun run --cwd packages/llm-core release:build
bun run test:package
bun run docs:check
bun run --cwd packages/llm-core format:check
```

## Work log

Planned from ADR-013; not claimed.

## Handoff

Pending.
