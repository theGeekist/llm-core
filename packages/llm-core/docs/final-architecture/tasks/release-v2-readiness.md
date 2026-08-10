---
architecture_version: 2
id: release-v2-readiness
title: Make v2 qualification, CI and release publication coherent
stage: architecture
status: done
priority: critical
evidence_milestone: null
replaced_by: []
forward_to: []
preferred_owner_kind: coordinator
owner: codex-root
owner_kind: coordinator
lease_started_at: 2026-08-09T12:00:00+08:00
lease_expires_at: 2026-08-10T12:00:00+08:00
base_sha: ac788c7dbcfa779f305c7a4ceb02a99c1e9f3d93
branch: main
worktree: /Users/jasonnathan/Repos/@theGeekist/llm-core
depends_on:
  - architecture-release-reproducibility
  - adapters-protocol-qualification
decision_dependencies:
  - ADR-007
  - ADR-015
conflicts_with: []
write_scope:
  - .github/workflows/ci.yml
  - .github/workflows/docs.yml
  - .github/workflows/release.yml
  - .gitignore
  - CHANGELOG.md
  - README.md
  - bun.lock
  - package.json
  - turbo.json
  - packages/aifsd/package.json
  - packages/llm-core/CHANGELOG.md
  - packages/llm-core/README.md
  - packages/llm-core/package.json
  - packages/llm-core/scripts/build.ts
  - packages/llm-core/scripts/smoke-package.mjs
  - packages/strict-json/CHANGELOG.md
  - packages/strict-json/README.md
  - packages/strict-json/package.json
  - packages/strict-json/scripts/**
  - packages/llm-core/tests/adapters/protocols/external-consumer/**
  - scripts/qualify-external-fixtures.ts
  - scripts/qualify-external-fixtures.test.ts
  - scripts/qualify-release.ts
  - scripts/qualify-release.test.ts
  - scripts/release-qualifiers.json
  - scripts/release-version.ts
  - scripts/release-version.test.ts
  - docs/reference/conformance.md
  - docs/reference/releases.md
  - packages/llm-core/docs/final-architecture/tasks/release-v2-readiness.md
  - packages/llm-core/docs/final-architecture/STATUS.md
required_reading:
  - path: packages/llm-core/docs/final-architecture/tasks/architecture-release-reproducibility.md
    reason: Preserve the canonical fail-closed qualification contract while changing its execution graph.
  - path: docs/reference/conformance.md
    reason: Preserve the distinction between implementation, qualification and published support evidence.
read_scope:
  - .github/workflows/**
  - .gitignore
  - CHANGELOG.md
  - README.md
  - bun.lock
  - package.json
  - turbo.json
  - packages/*/CHANGELOG.md
  - packages/*/README.md
  - packages/*/package.json
  - packages/llm-core/scripts/**
  - packages/strict-json/scripts/**
  - packages/llm-core/tests/adapters/protocols/external-consumer/**
  - scripts/**
  - docs/reference/**
  - packages/llm-core/docs/final-architecture/**
  - /Users/jasonnathan/Repos/@pipewrk/llm-core/**
review_owner: coordinator
updated_at: 2026-08-10
---

# release-v2-readiness — Make v2 qualification, CI and release publication coherent

## Objective

Make the imminent v2 release reproducible and legible: one dependency-aware,
bounded and cacheable qualification graph; CI that exercises it without hidden
gaps; a safe tagged publication workflow; and version/changelog evidence that
cannot silently drift from the package being released.

## Why this exists

The canonical qualifier is correct but repeatedly rebuilds and repacks the same
packages through nested scripts. The repository also has substantially more
completed work than its v1 tag history records, while the current v2 manifest
has no changelog contract tying the release contents, tag and publication path
together.

## Inputs

- Current canonical qualification and cumulative protocol qualifier registry.
- Current CI, documentation and tagged release workflows.
- The last v1 tag's release, version and changelog machinery as historical
  evidence.
- WPKernel's affected-task UX and caching patterns as comparative evidence,
  without importing its stale or ineffective cache implementations.

## In scope

- Decompose release qualification into atomic tasks with explicit dependencies,
  outputs and cache boundaries.
- Use bounded concurrency for independent checks and consumers, while
  serialising shared build, pack and install mutations.
- Add local and CI cache reuse for pure package tasks and retain fresh
  authoritative package/consumer preparation.
- Close material CI gaps and restore a guarded, dry-run-verifiable tagged
  release path.
- Establish package-owned v2 changelog and version/tag validation.

## Out of scope

- Publishing a package, creating a tag or choosing the final v2 release date.
- Preserving historical internal release APIs that no longer fit the final
  design.
- Reworking application deployment workflows unrelated to npm package release.

## Contract and naming constraints

- `release:qualify:llm-core` remains the canonical local and hosted release
  gate.
- Conditional public surfaces remain cumulative, fail closed and independently
  attributable in the qualifier registry.
- Cached results may accelerate pure checks and builds, but package archives,
  external consumer installs and publication provenance must remain fresh for
  authoritative release qualification.
- Version and changelog checks must resolve the package selected by the tag,
  rather than assuming one workspace-wide version.

## File ownership

Only edit the front matter, declared write scope, work log and handoff. The
brief above the work log is immutable while claimed.

## Acceptance criteria

- A cold qualification performs each package build once. Each independently
  isolated packed consumer prepares one fresh archive without rebuilding the
  package, and consumers never write shared outputs.
- A warm local qualification demonstrates useful reuse for declared pure tasks
  and never reuses release archives or consumer installations as publication
  evidence.
- CI runs the same atomic graph and canonical release gate with explicit cache
  keys, cancellation and least-privilege permissions.
- Tagged publication validates tag, package name, manifest version and
  changelog entry before any npm publish command can execute.
- The v2 changelog accounts for the material public work since `v1.21.5`
  without fabricating a publication date.
- New or materially changed hand-written source/test modules target roughly 500
  lines. Modules from 501 through 600 lines record the lightweight
  `approximately 500 lines` waiver; only modules above 600 require the stronger
  coordinator waiver and named follow-up.

## Verification

```sh
bun install --frozen-lockfile
bun test scripts/qualify-release.test.ts scripts/release-version.test.ts
bun run release:version:check
bun run release:qualify:llm-core
bun run release:qualify:llm-core
git diff --check
```

## Required evidence

- Cold and warm task timings with cache-hit or miss status.
- Changed file list and focused test results.
- Dry-run evidence for each supported release tag family.
- Remaining release risks and any deliberately deferred workflow family.

## Claim protocol

Follow [`../COORDINATION.md`](../COORDINATION.md) and the metadata contract in
[`../tasks/README.md`](../tasks/README.md). Do not restate those rules here.

## Work log

- Claim: `codex-root` began implementation from
  `ac788c7dbcfa779f305c7a4ceb02a99c1e9f3d93` with a lease through
  `2026-08-10T12:00:00+08:00`.
- Execution mode: shared-checkout.
- Execution rationale: the current checkout is clean and no task is active;
  release manifests, workflows and coordinator scripts require shared
  ownership to avoid a misleading partial qualification path.
- Concurrency evaluation: none; no active task currently owns an overlapping
  path.
- Concurrent task scopes: none.
- Swarm delegation: none.
- Historical evidence: at the user's direction, inspect
  `/Users/jasonnathan/Repos/@pipewrk/llm-core` read-only for the prior scripts,
  release workflow and version/changelog conventions. Its state is comparative
  evidence only and never project status.
- Historical finding: the pipewrk v1 checkout used `standard-version` and a
  generated changelog, but its combined CI/release job mutated the manifest
  from the tag after building and published without current packed-consumer
  qualification. Retained the version/changelog ergonomics, not that workflow.
- Implementation: added Turbo 2.10.9 with Bun 1.3.14 package-manager identity,
  a dependency-aware package build graph, bounded concurrency of two, local
  cache outputs and GitHub Actions cache restoration. Consolidated 31 llm-core
  Bun entrypoints into one multi-entrypoint build invocation.
- Qualification: decomposed the canonical gate into version, pure checks,
  build, isolated package smoke and external-consumer phases. Package builds
  occur once; both isolated consumers pack fresh prebuilt output. Tests and
  repository governance remain explicitly uncached because they observe
  ambient runtime or Git state.
- Release contract: added package-owned llm-core and strict-json changelogs,
  exact tag/manifest/changelog validation, npm provenance, workflow dry runs,
  least-privilege job permissions and cancellation. Removed the unowned
  wildcard application publication lane.
- Performance evidence: the dependency build completed in 0.95 seconds cold
  and 0.04 seconds warm. The forced-cold canonical qualification passed in
  30.58 seconds. With 10 of 13 pure package checks and both builds cached, the
  final warm qualification passed in 18.54 seconds while all tests,
  governance checks, packs and consumer installs reran.
- Known tooling caveat: Turbo 2.10.9 warns that it cannot derive a fine-grained
  workspace dependency hash from Bun 1.3.14's root lock entry. The complete
  `bun.lock` is a global cache input, so dependency drift invalidates every
  cache entry conservatively; no generated lockfile was hand-edited.

## Blocker

None.

## Handoff

### Result

Review corrections implemented; receiving verification and approval remain
pending.

### Decisions applied

- Preserve one canonical `release:qualify:llm-core` entrypoint.
- Cache only deterministic package checks and build outputs.
- Keep tests, Git-sensitive governance, archives and consumer installs fresh.
- Keep changelogs package-owned because package versions and tags are
  independent.

### Files changed

- Root/package manifests, lockfile, Turbo configuration and cache ignores.
- CI, documentation and tagged release workflows.
- llm-core build, package smoke, external fixture and release orchestration.
- Package-owned changelogs and version-contract tests.

### Verification evidence

- Focused release and provenance suites passed after receiving corrections.
- The canonical `release:qualify:llm-core` gate passed with deterministic
  package checks cached and governance, packing and consumer installs fresh.
- Independent `@aifsd/strict-json` and `@aifsd/sdk` release qualification
  passed, including isolated packed runtime and declaration consumers.
- Version, changelog and provenance validation passed for all three packages.
- `git diff --check`, SLOC validation and the architecture task planner passed.

### Deviations

- Turbo emits a non-fatal Bun lock parser warning. Conservative whole-lockfile
  invalidation preserves cache correctness until either tool aligns its parser.

### Remaining risks

- The independent review findings covering required plans, receipt validation,
  exact archive publication, exact registry dependencies and recoverable
  partial publication were corrected and the receiving review approved them.
- The current `2.0.0`, strict-json `0.1.0` and SDK `0.1.0` changelog sections are deliberately
  `Unreleased`. A tag remains blocked until the owning changelog heading is
  replaced with the actual publication date.
- Hosted GitHub Actions execution has not been observed from this uncommitted
  workspace diff.

### Recommended next task

Date the selected package changelog, run the release workflow's manual dry run,
review the generated npm archive and only then create the matching tag.
