---
architecture_version: 2
id: I0-010
title: Characterize current public API and migration blast radius
phase: I0
status: complete
priority: P0
preferred_owner_kind: claude-code
owner: Claude Code
owner_kind: claude-code
lease_started_at: 2026-07-29T16:00:11+0800
lease_expires_at: null
base_sha: 8021ac6c3103115422d943b30f5ddb5df2e58ec8
branch: main
worktree: main
depends_on: []
decision_dependencies: []
conflicts_with: []
write_scope:
  - packages/llm-core/tests/architecture/**
  - packages/llm-core/internal/final-architecture/tasks/I0-010-characterize-public-api.md
read_scope:
  - packages/llm-core/index.ts
  - packages/llm-core/package.json
  - packages/llm-core/src/**
  - packages/llm-core/tests/**
  - docs/**
review_owner: coordinator
updated_at: 2026-07-29
---

# I0-010 — Characterize Current Public API and Migration Blast Radius

## Objective

Create compile-level characterization fixtures for the current public/subpath
surface and record exact old-name call-site counts before replacements begin.

## In scope

- Root and subpath export compile fixtures.
- Current serialized/live state shape fixtures where feasible.
- Reproducible `rg` counts for the replacement vocabulary.

## Out of scope

New contracts, renames, package changes and behavior modifications.

## Acceptance criteria

- Fixtures fail if an existing public path disappears before its owning task.
- Blast-radius evidence covers naming targets listed in ADR-002.
- No production file or shared test fixture changes.

## Verification

```sh
bun test packages/llm-core/tests/architecture
bun run typecheck:tests
```

## Work log

- 2026-07-29T16:00+0800 — Claude Code. Human coordinator authorized a direct
  start on `main` (no dedicated worktree). Base SHA
  `8021ac6c3103115422d943b30f5ddb5df2e58ec8`. Confirmed no `depends_on` and no
  `decision_dependencies`; ADR-002 (naming targets) is accepted. Verified all 15
  public source indexes backing `package.json` `exports` exist. Captured the
  ADR-002 blast-radius baseline (src only): `construct` 117, `Outcome` 67,
  `Runtime` 55, `artefact` 36, `Memory` 14, `AgentRuntime` 6, `Thread` 6,
  `createAgentRuntime` 3. Authoring characterization fixtures under
  `tests/architecture/`.
- 2026-07-29T16:12+0800 — Coordinator review independently passed all 31
  architecture tests and `typecheck:tests`. Returned one bounded revision:
  extend the blast-radius ledger to cover the remaining high-impact legacy
  execution names from the accepted assessment, including `AdapterCallContext`,
  `ModelCall`, `ModelResult`, `EventStream`, `Tool`, `ToolCall`, `ToolResult`,
  `InterruptStrategy`, and interaction pause/snapshot names.
- 2026-07-29T16:30+0800 — Claude Code. Addressed the review note. Extended
  `adr-002-blast-radius.md` with two sections: (1) additional high-impact legacy
  execution names — `AdapterCallContext` 33, `ModelCall` 58, `ModelResult` 42,
  `EventStream` 81, `Tool` 56, `ToolCall` 49, `ToolResult` 44, `InterruptStrategy`
  18; and (2) the pause/snapshot/resume family aggregate — 491 across `src`, 118
  in `src/interaction`, with notable identifiers and their ADR-002 lifecycle
  targets. Re-ran verification; re-submitting for review.
- 2026-07-29T16:44+0800 — Architecture coordinator. Accepted the revision after
  independently reproducing every recorded baseline count, passing all 31
  architecture tests, and passing `typecheck:tests`. Task marked complete.

## Handoff

Status: complete (coordinator review accepted).

### Files changed (write scope only)

- `packages/llm-core/tests/architecture/public-surface.characterization.test.ts`
  (new) — static namespace imports of all 15 public backing sources; per-subpath
  test asserting the subpath is present in `package.json` `exports`, the backing
  source file exists, and the namespace is defined. A removed public source
  breaks compile (`typecheck:tests` + `bun test`); a removed manifest subpath
  fails the assertion.
- `packages/llm-core/tests/architecture/public-exports.characterization.test.ts`
  (new) — inline snapshot of each namespace's sorted value-export keys, plus
  compile-level pinning of the root index's named and type-only exports.
- `packages/llm-core/tests/architecture/adr-002-blast-radius.md` (new) —
  reproducible `rg` command and captured baseline counts for the ADR-002 naming
  targets.
- `packages/llm-core/internal/final-architecture/tasks/I0-010-characterize-public-api.md`
  — this task file (ownership, status, work log, handoff).

### Public surface characterized

Root `.` plus 14 subpaths (15 total `exports` entries). The brief's "15
subpaths" was off by one; the manifest has 14 subpaths + root. All 15 entries
are covered.

### Verification

- `bun test tests/architecture` → `31 pass, 0 fail, 15 snapshots, 61 expect()`;
  exit 0.
- `bun run typecheck:tests` (`tsc -p tsconfig.test.json --noEmit`) → exit 0.
- `git status` confirms changes are limited to `tests/architecture/**` (new) and
  this task file.

### ADRs applied

ADR-002 (accepted) — naming targets drive the blast-radius baseline.

### Deviations

- Snapshots use `toMatchInlineSnapshot()` (not `toMatchSnapshot()`) to keep all
  baselines inside the three declared fixture files, avoiding a `.snap` artifact
  outside the intended set.
- Worked directly on `main` at base SHA
  `8021ac6c3103115422d943b30f5ddb5df2e58ec8` per human-coordinator authorization,
  rather than a dedicated worktree/branch. No commit made (AGENTS.md: do not
  commit unless requested).

### Shared-file requests for the integration owner

None. No root export, `package.json`, lockfile, or shared fixture change is
requested. When later tasks rename public paths, they must update these
characterization fixtures in the same change (expected and intended failure
signal).

### Risks / known limits

- Value-export snapshots capture runtime-visible names only; type-only exports
  are pinned explicitly for the root index but not exhaustively for every
  subpath. Extending compile-level type pinning per subpath is possible if the
  coordinator wants stronger type-surface coverage.
