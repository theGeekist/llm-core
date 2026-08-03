---
architecture_version: 2
id: architecture-release-reproducibility
title: Freeze release installs and reusable qualification gates
stage: architecture
status: proposed
priority: critical
preferred_owner_kind: coordinator
owner:
owner_kind:
lease_started_at:
lease_expires_at:
base_sha:
branch:
worktree:
depends_on:
  - architecture-decisions
  - architecture-source-layout-normalization
decision_dependencies:
  - ADR-007
  - ADR-015
conflicts_with:
  - architecture-status-validation
  - runtime-tools-front-boundary
  - applications-desktop
  - applications-mobile
write_scope:
  - .bun-version
  - .github/workflows/ci.yml
  - .github/workflows/docs.yml
  - .github/workflows/release.yml
  - package.json
  - packages/llm-core/package.json
  - scripts/qualify-release.ts
  - scripts/qualify-release.test.ts
  - scripts/release-qualifiers.json
  - scripts/check-sloc.ts
  - scripts/check-sloc.test.ts
  - scripts/sloc-baseline.json
  - scripts/qualify-external-fixtures.ts
  - scripts/qualify-external-fixtures.test.ts
  - docs/reference/conformance.md
  - packages/llm-core/internal/final-architecture/tasks/architecture-release-reproducibility.md
read_scope:
  - bun.lock
  - packages/llm-core/src/**
  - packages/llm-core/tests/**
review_owner: coordinator
updated_at: 2026-08-03
---

# architecture-release-reproducibility — Freeze release installs and reusable qualification gates

## Objective

Make the dependency graph, external SDK fixtures and 500-SLOC boundary fail
closed in local qualification, CI and tagged npm releases.

## In scope

- One repository-owned Bun version consumed by local instructions and every
  workflow.
- Frozen root installs in CI, documentation and release jobs; remove the
  mutable package-local release install.
- A root `qualify:external-fixtures` command that discovers each task-owned
  `external-consumer` package, performs its frozen install and invokes its
  required `qualify` script without workspace fallback.
- One canonical root `release:qualify:llm-core` command that owns the frozen
  install, package release build, packed consumer, external fixtures,
  documentation, formatting and SLOC gates. The tagged workflow and the
  package-owned `publish:npm` command both delegate to it; neither duplicates a
  shorter command list.
- A versioned `scripts/release-qualifiers.json` registry for qualification that
  becomes mandatory only after a conditional public surface is published. Each
  registration names its public surface, support/version window, owner and
  deterministic command. The canonical release command executes every
  registration and fails on an absent, duplicate, skipped or failing qualifier.
- A root `check:sloc` gate for hand-written source and test modules. New files
  may not exceed 500 physical source lines. Existing exceptions are recorded
  with their current ceiling and content digest. A changed exception must fall
  to 500 lines or carry a versioned coordinator waiver naming its follow-up;
  line-count reduction alone is not sufficient.
- CI/release integration for both reusable gates.

## Out of scope

- Implementing any external adapter, automatically publishing npm artifacts or
  mechanically splitting files without reviewing their cohesion.

## Acceptance criteria

- A stale or missing root lockfile fails every workflow instead of being
  repaired.
- Local and workflow qualification report the same Bun version.
- A fixture without its own lockfile, a frozen-installable graph or a passing
  `qualify` script fails discovery.
- New hand-written source/test modules over 500 lines fail. A baseline exception
  changed at or below its old ceiling also fails unless it is decomposed or has
  versioned waiver metadata naming a follow-up. Generated/vendor/snapshot data
  is excluded by explicit path rules rather than ad hoc task decisions.
- The release job runs the complete package release build, packed consumer,
  external fixtures, documentation check, formatting and SLOC gate before npm
  publication.
- The repository-owned local `publish:npm` path and tagged workflow invoke the
  same `release:qualify:llm-core` command. Tests fail if either path bypasses it
  or if the canonical command omits a baseline gate.
- SLOC tests cover growth, same-size and reduced-size content changes, valid
  waiver expiry/removal and missing follow-up references.
- Registry tests cover empty, duplicate, unknown, skipped and failing support
  qualifiers. Publication tasks can add a registration without changing the
  release orchestrator.

## Verification

```sh
bun install --frozen-lockfile
bun test scripts/check-sloc.test.ts scripts/qualify-external-fixtures.test.ts
bun test scripts/qualify-release.test.ts
bun run check:sloc
bun run qualify:external-fixtures
bun run --cwd packages/llm-core release:build
bun run test:package
bun run docs:check
bun run --cwd packages/llm-core format:check
bun run release:qualify:llm-core
git diff --check
```

## Work log

Added after release review found mutable CI/tag installs and no reusable owner
for independent native-consumer qualification or the 500-SLOC rule; not
claimed.

## Handoff

Pending.
