---
architecture_version: 2
id: architecture-release-reproducibility
title: Freeze release installs and reusable qualification gates
stage: architecture
status: done
priority: critical
preferred_owner_kind: coordinator
owner: codex-root
owner_kind: coordinator
lease_started_at: 2026-08-03T17:08:28+08:00
lease_expires_at: 2026-08-04T17:08:28+08:00
base_sha: ca027dcc3f3b215d8cbd1f2eb376612e68d2f12e
branch: main
worktree: /Users/jasonnathan/Repos/@theGeekist/llm-core
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
  - packages/llm-core/internal/final-architecture/STATUS.md
read_scope:
  - bun.lock
  - packages/llm-core/src/**
  - packages/llm-core/tests/**
review_owner: coordinator
updated_at: 2026-08-04
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

- Claim: `codex-root` began implementation from
  `ca027dcc3f3b215d8cbd1f2eb376612e68d2f12e` with a lease through
  `2026-08-04T17:08:28+08:00`.
- Execution mode: shared-checkout.
- Execution rationale: release/governance files are disjoint from the active
  runtime decomposition source and test subtree; a dedicated worktree would
  not remove the need to sequence repository-wide SLOC and release evidence.
- Concurrency evaluation: `runtime-tool-execution-decomposition`; start
  alongside because implementation writes are disjoint. Generate the final
  SLOC baseline and run repository-wide qualification only after its
  source/test rewrite settles.
- Concurrent task scopes: `runtime-tool-execution-decomposition` owns
  `packages/llm-core/src/application/tool-execution/**` and matching tests;
  this task owns release workflows, manifests, root qualification scripts,
  conformance documentation and its task record.
- Swarm delegation: `release_gate_review` performed a read-only review of the
  new scripts and tests. Its workflow-bypass, date-validation, identifier,
  lint and typing findings were resolved before final qualification.
- Implementation: pinned Bun `1.3.8`; made every workflow install frozen;
  added deterministic external-consumer discovery, a digest-pinned SLOC
  baseline with ten legacy exceptions, a cumulative release-qualifier registry
  and one canonical local/tagged npm qualification path.
- Review remediation: made the registry's `requiredSurfaces` declaration
  mandatory and fail closed when a published surface lacks its durable
  qualifier; made workflow validation inspect inline and multiline `run`
  commands for mutable or package-local Bun installs. A subsequent review made
  the current package exports a sealed unconditional inventory, so every new
  manifest export requires registry coverage, and made SLOC v1 enforce its
  code-owned 500-line limit, canonical exclusions and complete sealed legacy
  set independently of editable baseline values.
- Verification: focused release/SLOC/fixture suite passed 38 tests, including
  real manifest exports omitted from the registry, changed SLOC limits,
  broadened exclusions, removed sealed entries, multiline workflow installs,
  simultaneous source/baseline-rewrite and new-oversized-file bypass cases;
  targeted
  strict TypeScript and ESLint checks passed; frozen install checked 1,395
  installs across 1,236 packages without changes; SLOC checked 388 modules;
  external discovery qualified the current zero fixtures; package
  `release:build` passed 667 tests with four intentional upstream-runtime
  skips; packed consumer verified all 30 runtime/declaration exports; docs
  verified 45 pages and 26 snippets; formatting and `git diff --check` passed;
  canonical `release:qualify:llm-core` passed end to end.
- Deviations and remaining risk: none in task scope. Conditional-surface
  registrations remain empty until a publication task adds the first supported
  surface to `requiredSurfaces` together with its version window, owner and
  deterministic command.
- Completion: coordinator review passed on 4 August 2026 and authorized the
  task status transition and task-scoped commit.

## Handoff

Coordinator review passed. Commit only this task's release workflows,
manifests, qualification scripts, documentation, task record and status
projection.
