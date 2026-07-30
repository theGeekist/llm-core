---
architecture_version: 2
id: P2-320
title: Specification public front and multi-format conformance
phase: P2.3
status: proposed
priority: P1
preferred_owner_kind: coordinator
owner:
owner_kind: codex
lease_started_at:
lease_expires_at:
base_sha:
branch:
worktree:
depends_on:
  - P2-315
decision_dependencies:
  - ADR-007
  - ADR-009
conflicts_with: []
write_scope:
  - packages/llm-core/src/specifications/**
  - packages/llm-core/tests/architecture/**
  - packages/llm-core/package.json
  - packages/llm-core/scripts/build.ts
  - packages/llm-core/tsconfig.json
  - packages/llm-core/tsconfig.build.json
  - packages/llm-core/internal/final-architecture/tasks/P2-320-specification-public-front.md
read_scope:
  - packages/llm-core/src/features/specifications/**
  - packages/llm-core/src/application/specification-compiler/**
  - packages/llm-core/src/application/agent/**
  - packages/llm-core/src/application/workflow/**
review_owner: coordinator
updated_at: 2026-07-30
---

# P2-320 — Specification public front and multi-format conformance

## Objective

Publish the specification capability as one explicit package front and prove
multi-format extensibility with adapter-neutral conformance fixtures.

## Deliverables

- `@geekist/llm-core/specifications` as the sole aggregate specification front.
- Two deliberately unlike test dialects exercising source-oriented import and
  runtime-oriented projection without publishing framework adapters.
- Support declarations that distinguish parsing, semantic preservation,
  admission and executable projection conformance.
- Public projection envelopes and authority-snapshot verification whose
  controlled preparation/execution integration is already proven by P2-315.
- Runtime, declaration and isolated packed-consumer verification for all 20
  public entries.

## Acceptance criteria

- The package root remains unchanged.
- Framework dependencies and native types do not leak into the core
  specification front.
- Unsupported source semantics are preserved under namespaced extensions,
  reported as degraded or rejected.
- OpenSpec, PydanticAI, AI-SDLC, Spec Kit and BMAD are documented as later
  qualified adapters, not implied support.
- Architecture tests reject deep feature/application imports.
- The complete package release, isolated consumer, documentation and formatting
  gates pass after the twentieth front is added.

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

Pending P2-310.

## Handoff

Pending.
