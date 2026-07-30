---
architecture_version: 2
id: language-vocabulary
title: Exact public vocabulary and package surfaces
stage: language
status: proposed
priority: critical
preferred_owner_kind: coordinator
owner:
owner_kind: codex
lease_started_at:
lease_expires_at:
base_sha:
branch:
worktree:
depends_on:
  - language-audit
decision_dependencies:
  - ADR-011
conflicts_with: []
write_scope:
  - packages/llm-core/internal/final-architecture/LANGUAGE.md
  - packages/llm-core/internal/final-architecture/PLAN.md
  - packages/llm-core/internal/final-architecture/SPECIFICATIONS.md
  - packages/llm-core/internal/final-architecture/decisions/ADR-012-exact-public-vocabulary.md
  - packages/llm-core/internal/final-architecture/decisions/README.md
  - packages/llm-core/internal/final-architecture/tasks/language-vocabulary.md
  - packages/llm-core/internal/final-architecture/tasks/specification-*.md
  - packages/llm-core/internal/final-architecture/tasks/adapter-*.md
  - packages/llm-core/tests/language/**
read_scope:
  - packages/llm-core/src/**
  - packages/llm-core/tests/**
  - packages/llm-core/README.md
  - docs/**
review_owner: coordinator
updated_at: 2026-07-31
---

# language-vocabulary — Exact public vocabulary and package surfaces

## Objective

Propose one exact replacement map, synchronize every downstream architecture
brief and record the intended public experience with common-journey fixtures
before implementation begins.

## Deliverables

- Exact common, extension and internal classification for every exported
  symbol.
- Final noun and verb map for agents, tools, workflows, conversations,
  specifications and their results.
- Final package-root and subpath ownership.
- Desired public API fixture sources for the five common journeys. They remain
  outside the green package typecheck until implementation exists.
- Explicit list of wire-contract names that require schema-version treatment.
- Proposed ADR-012 containing the exact replacement names, package surfaces and
  serialized-contract decisions.
- Synchronized specification and adapter briefs with no stale prescribed
  names.

## Acceptance criteria

- One concept has one public name.
- The common fixtures contain no internal lifecycle vocabulary.
- Extension authors retain every contract required to implement safety and
  portability guarantees.
- No proposed alias or compatibility shim remains.
- Specification and adapter briefs use the proposed exact language.
- ADR-012 is ready for coordinator review. `language-rollout` remains blocked
  until it is accepted.

## Verification

```sh
bunx prettier packages/llm-core/internal/final-architecture --check
git diff --check
```

## Work log

Pending review and acceptance of language-level ADR-011. Once accepted, this
task may create the separate exact-vocabulary ADR-012 without a circular gate.

## Handoff

Pending.
