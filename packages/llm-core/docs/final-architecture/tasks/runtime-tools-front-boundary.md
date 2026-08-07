---
architecture_version: 2
id: runtime-tools-front-boundary
title: Remove the tooling feature-to-application boundary exception
stage: qualification
status: proposed
priority: high
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
  - runtime-tool-execution-decomposition
decision_dependencies:
  - ADR-001
  - ADR-005
  - ADR-008
  - ADR-012
  - ADR-015
conflicts_with:
  - architecture-release-reproducibility
  - architecture-status-validation
  - adapter-openspec-release
  - adapter-pydantic-ai-release
  - adapter-ai-sdlc-release
  - adapter-spec-kit-release
  - adapter-bmad-release
  - adapter-strands-runtime-release
  - adapter-strands-runtime
  - runtime-temporal-reference
  - adapters-protocol-qualification
  - applications-client-subpath-release
  - architecture-legacy-functional-removal
write_scope:
  - packages/llm-core/src/features/tooling/runtime.ts
  - packages/llm-core/src/tools/**
  - packages/llm-core/package.json
  - packages/llm-core/scripts/build.ts
  - packages/llm-core/scripts/smoke-package.mjs
  - packages/llm-core/tsconfig.json
  - packages/llm-core/tsconfig.build.json
  - packages/llm-core/tests/architecture/**
  - docs/reference/package-exports.md
  - packages/llm-core/docs/final-architecture/tasks/runtime-tools-front-boundary.md
required_reading:
  - path: docs/reference/package-exports.md
    reason: "Preserve the exact tools runtime export while removing only the internal dependency exception."
read_scope:
  - docs/reference/package-exports.md
  - packages/llm-core/src/application/tool-execution/**
  - packages/llm-core/src/features/tooling/**
review_owner: coordinator
updated_at: 2026-08-02
---

# runtime-tools-front-boundary — Remove the tooling feature-to-application boundary exception

## Objective

Make the tools runtime package front the aggregation owner so the tooling
feature no longer imports upward into application orchestration.

## In scope

- Move public aggregation to the package-level tools runtime front.
- Remove the architecture-test exception permitting
  `features/tooling/runtime.ts -> application/tool-execution/public.ts`.
- Preserve the existing `@geekist/llm-core/tools/runtime` API exactly.

## Out of scope

- New exports, controlled-execution behavior changes or feature rearrangement.

## Acceptance criteria

- Feature dependency checks pass with no tooling-to-application exception.
- Runtime and declaration consumers observe no API change.
- The complete release and isolated packed-consumer gates pass.

## Verification

```sh
bun test packages/llm-core/tests/architecture packages/llm-core/tests/application/tool-execution
bun run --cwd packages/llm-core release:build
bun run test:package
bun run docs:check
bun run --cwd packages/llm-core format:check
```

## Work log

Planned by ADR-015; not claimed.

## Handoff

Pending.
