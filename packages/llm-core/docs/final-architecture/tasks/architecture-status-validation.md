---
architecture_version: 2
id: architecture-status-validation
title: Mechanically validate the architecture status projection
stage: architecture
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
  - architecture-decisions
  - architecture-source-layout-normalization
decision_dependencies:
  - ADR-015
conflicts_with:
  - architecture-release-reproducibility
  - runtime-tools-front-boundary
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
  - applications-desktop
  - applications-mobile
write_scope:
  - package.json
  - scripts/check-docs.ts
  - packages/llm-core/scripts/check-architecture-status.ts
  - packages/llm-core/package.json
  - packages/llm-core/tests/architecture/**
  - packages/llm-core/docs/final-architecture/STATUS.md
  - packages/llm-core/docs/final-architecture/tasks/architecture-status-validation.md
required_reading:
  - path: packages/llm-core/docs/final-architecture/STATUS.md
    reason: "Use the current generated projection as the byte-for-byte validation target."
read_scope:
  - packages/llm-core/docs/final-architecture/STATUS.md
  - packages/llm-core/docs/final-architecture/tasks/**
  - packages/llm-core/docs/final-architecture/decisions/**
  - packages/llm-core/docs/final-architecture/templates/task.md
  - packages/llm-core/docs/final-architecture/COORDINATION.md
review_owner: coordinator
updated_at: 2026-08-03
---

# architecture-status-validation — Mechanically validate the architecture status projection

## Objective

Prevent the human status document from drifting from authoritative task front
matter.

## In scope

- Validate an exact, bidirectional and exactly-once projection of every task ID,
  stage, status and dependency plus the active-task count and optional
  `evidence_milestone`/`replaced_by`/`forward_to` metadata.
- Provide one deterministic renderer used by the coordinator to regenerate
  the marked generated region in `STATUS.md` from task front matter. Check mode
  compares that region byte-for-byte; write mode preserves prose outside it.
- Detect missing dependencies, dependency cycles and asymmetric conflicts.
- Reject omitted tasks, unknown rows, duplicate rows and human aliases in task
  or dependency cells.
- Validate task IDs against filenames, allowed lifecycle/stage/priority/owner
  vocabularies defined in `tasks/README.md`, accepted decision dependencies,
  self-dependencies and self-conflicts.
- Validate every task has a non-empty ordered `required_reading` list whose
  entries contain only `path`, `reason` and optional `ref`; paths name exact
  configured local files, reasons are non-empty, refs are full Git revisions,
  duplicates are rejected and each exact path is declared in `read_scope`.
- Resolve current and revision-pinned reading through the same configured
  repository aliases as `tasks:context`; reject missing current files and refs
  that do not contain the named historical file.
- Validate every `replaced_by` entry as either an existing local task ID or an
  existing `<package-name>/<task-id>` replacement in committed package
  authority. Validate `forward_to` only as an exact package-qualified reference
  to planned, uncommitted authority. Project replacements and forward targets
  verbatim in distinct fields without treating either as local dependency nodes.
- Validate active-task ownership, lease, base, branch and checkout-path
  invariants. The `worktree` field records either the shared checkout or a
  dedicated worktree; require matching mode, rationale, real-time concurrency
  evaluation and concurrent-scope evidence in the work log. Reject overlapping
  active writers regardless of mode: a separate checkout is not a boundary
  waiver.

## Out of scope

- A scheduler, task-state mutation or inferring status from Git history.

## Acceptance criteria

- The check fails with actionable diagnostics for deliberately corrupted,
  omitted, duplicated, unknown, stale-status and stale-dependency fixtures.
- Transition fixtures cover `claimed`, `in_progress`, `review`, `blocked` and
  `done`: coordinator write mode regenerates the matching projection, while a
  task-only status edit fails check mode.
- Negative fixtures also cover invalid enum values, missing or unaccepted ADRs,
  malformed active leases, incomplete concurrency/execution-mode evidence,
  filename/ID mismatch, self-edges, unknown local replacements, unqualified
  foreign replacements, nonexistent committed replacements, malformed
  package-qualified replacement/forward metadata, missing or malformed
  required reading, nonexistent current or revision-pinned reading, reading
  outside exact read authority, conflicting `replaced_by`/`forward_to` values
  and active write-scope collisions.
- The check is read-only and deterministic.
- The package release gate and repository documentation gate both run the
  check.

## Verification

```sh
bun test packages/llm-core/tests/architecture
bun run --cwd packages/llm-core write:architecture-status
bun run --cwd packages/llm-core check:architecture-status
bun run --cwd packages/llm-core release:build
bun run docs:check
```

## Work log

Planned by ADR-015; not claimed.

## Handoff

Pending.
