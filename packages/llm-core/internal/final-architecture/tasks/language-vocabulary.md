---
architecture_version: 2
id: language-vocabulary
title: Exact public vocabulary and package surfaces
stage: language
status: review
priority: critical
preferred_owner_kind: coordinator
owner: codex-root
owner_kind: codex
lease_started_at: 2026-07-31T04:56:07+08:00
lease_expires_at: 2026-08-01T04:56:07+08:00
base_sha: b87116c21ccb833cf3084bf2f12e277d5cbb6c0e
branch: main
worktree: /Users/jasonnathan/Repos/@theGeekist/llm-core
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
  - packages/llm-core/internal/final-architecture/tasks/language-rollout.md
  - packages/llm-core/internal/final-architecture/tasks/language-vocabulary.md
  - packages/llm-core/internal/final-architecture/tasks/specification-*.md
  - packages/llm-core/internal/final-architecture/tasks/adapter-*.md
  - packages/llm-core/tests/language/**
  - packages/llm-core/package.json
  - bun.lock
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
node packages/llm-core/tests/language/inventory-public-exports.mjs >/dev/null
! rg -i '\b(port|binding|registry|provenance|envelope|snapshot|admission|projection|disposition|conformance)\b' packages/llm-core/tests/language/desired
bunx prettier packages/llm-core/internal/final-architecture --check
git diff --check
```

## Work log

- 2026-07-31 — ADR-011 accepted after independent review. Claimed by the
  coordinator at `b87116c`; three read-only agents were assigned disjoint
  common-API, specification-language and package-surface audits.
- 2026-07-31 — The audits converged on five common facades, qualified runtime
  and capability fronts, an internal-only compilation-authority verifier and
  no compatibility aliases. ADR-012, desired-journey fixtures and a
  compiler-resolved 731-export inventory were drafted.
- 2026-07-31 — `@wpkernel/pipeline` 1.2.0 was pinned exactly. The package
  release build passed 515 tests with one optional compatibility skip, and the
  isolated packed consumer verified all 19 runtime and declaration exports.

## Handoff

ADR-012, the five desired common journeys and the compiler-resolved export
inventory are ready for coordinator review. The specification and adapter
briefs use the proposed exact names, and Pipeline 1.2.0 is independently
qualified. Do not claim language-rollout until ADR-012 is accepted and this
task is marked done.
