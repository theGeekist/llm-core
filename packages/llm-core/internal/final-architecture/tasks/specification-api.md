---
architecture_version: 2
id: specification-api
title: Specification API and format compatibility
stage: specifications
status: proposed
priority: high
preferred_owner_kind: coordinator
owner:
owner_kind: codex
lease_started_at:
lease_expires_at:
base_sha:
branch:
worktree:
depends_on:
  - specification-authority
decision_dependencies:
  - ADR-007
  - ADR-009
  - ADR-011
  - ADR-012
conflicts_with: []
write_scope:
  - packages/llm-core/src/specifications/**
  - packages/llm-core/tests/architecture/**
  - packages/llm-core/package.json
  - packages/llm-core/scripts/build.ts
  - packages/llm-core/tsconfig.json
  - packages/llm-core/tsconfig.build.json
  - packages/llm-core/internal/final-architecture/tasks/specification-api.md
read_scope:
  - packages/llm-core/src/features/specifications/**
  - packages/llm-core/src/application/specification-compiler/**
  - packages/llm-core/src/application/agent/**
  - packages/llm-core/src/application/workflow/**
review_owner: coordinator
updated_at: 2026-07-31
---

# specification-api — Specification API and format compatibility

## Objective

Publish the specification capability as one explicit package API and prove
multi-format compatibility with adapter-neutral fixtures.

## Deliverables

- `@geekist/llm-core/specifications` as the full extension specification front,
  with the common load/review/compile journey also exported from the root.
- Two deliberately unlike test dialects exercising source-oriented import and
  runtime-oriented compilation without publishing framework adapters.
- Support declarations that distinguish parsing, semantic preservation,
  review and executable-compilation support.
- Public `SpecificationDecision` and `CompiledSpecification<T>` contracts whose
  controlled preparation/execution integration is already proven by
  specification-authority. Authority snapshots and verification stay internal.
- Runtime, declaration and isolated packed-consumer verification for all 30
  public entries.

## Acceptance criteria

- The package root adds only `loadSpecification`, `reviewSpecification`,
  `compileSpecification` and their common facade contracts.
- Framework dependencies and native types do not leak into the core
  specification front.
- Unsupported source semantics are preserved under namespaced extensions,
  reported as degraded or rejected.
- OpenSpec, PydanticAI, AI-SDLC, Spec Kit and BMAD are documented as later
  qualified adapters, not implied support.
- Architecture tests reject deep feature/application imports.
- The complete package release, isolated consumer, documentation and formatting
  gates pass after the thirtieth front is added.

## Verification

```sh
bun test packages/llm-core/tests/specifications
bun test packages/llm-core/tests/architecture
bun run --cwd packages/llm-core release:build
bun run test:package
bun run docs:check
bun run --cwd packages/llm-core format:check
```

## Work log

Pending specification-compiler.

## Handoff

Pending.
