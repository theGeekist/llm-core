---
architecture_version: 2
id: P1-210
title: Context manifest and artifact domains
phase: P1.1
status: proposed
priority: P1
preferred_owner_kind: claude-code
owner: null
owner_kind: null
lease_started_at: null
lease_expires_at: null
base_sha: null
branch: null
worktree: null
depends_on:
  - P0-150
decision_dependencies:
  - ADR-001
  - ADR-003
  - ADR-005
conflicts_with: []
write_scope:
  - packages/llm-core/src/features/context/**
  - packages/llm-core/src/features/artifacts/**
  - packages/llm-core/tests/context/**
  - packages/llm-core/tests/artifacts/**
  - packages/llm-core/internal/final-architecture/tasks/P1-210-context-artifacts.md
read_scope:
  - packages/llm-core/src/contracts/**
  - packages/llm-core/src/features/evidence/**
review_owner: coordinator
updated_at: 2026-07-29
---

# P1-210 — Context manifest and artifact domains

## Objective

Introduce explicit, provider-neutral context and artifact domains after the core execution contracts have stabilized.

## Deliverables

- A `ContextManifest` with entries, provenance, scope, and budget metadata.
- Artifact contracts using the canonical `artifact` spelling.
- Feature public surfaces that do not expose provider SDK types.
- Focused tests for manifest construction, deterministic identity, and artifact references.

## Acceptance criteria

- Context is modeled as explicit input rather than hidden prompt assembly.
- Artifact identity and references follow ADR-003.
- The features import only contracts, shared utilities, or their own internals.
- Public export changes are proposed in the handoff for the integration owner.

## Verification

```sh
bun test packages/llm-core/tests/context packages/llm-core/tests/artifacts
bun run typecheck:packages
```

## Work log

- Not started.

## Handoff

- None.
