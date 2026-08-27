---
id: architecture-status-validation
title: Mechanically validate the architecture status projection
stage: architecture
status: done
priority: high
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
  - packages/llm-core/docs/final-architecture/tasks/release-history-provenance.md
  - packages/llm-core/docs/final-architecture/tasks/release-v2-readiness.md
  - packages/llm-core/docs/final-architecture/tasks/architecture-adapter-sloc-decomposition.md
  - packages/llm-core/docs/final-architecture/tasks/runtime-operation-contract-correction.md
  - packages/llm-core/docs/final-architecture/tasks/runtime-tools-front-boundary.md
  - packages/llm-core/docs/final-architecture/tasks/specification-exact-operation-contracts.md
  - packages/llm-core/docs/final-architecture/tasks/adapter-openspec-release.md
  - packages/llm-core/docs/final-architecture/tasks/adapter-pydantic-ai-release.md
  - packages/llm-core/docs/final-architecture/tasks/adapter-spec-kit-release.md
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

Execution mode: shared-checkout
Execution rationale: The canonical checkout is the default and the task owns its complete implementation, validation, generated-status and gate-integration surface.
Concurrency evaluation: adapter-coding-agent-integration plus ongoing public documentation, AIFSD private-authority and Simple Chat work; start alongside because their declared and observed writes are outside this task's write scope and the active llm-core peer is not listed in conflicts_with.
Concurrent task scopes: adapter-coding-agent-integration owns apps/coding-agent-qualification/**, packages/llm-core/src/adapters/coding-agent/**, packages/llm-core/tests/adapters/coding-agent/\*\*, docs/adapters/coding-agent.md and its own task brief; public docs, package documentation, AIFSD private authority and Simple Chat remain disjoint from this task's mechanical status-validation files.
Swarm delegation: none

Claimed by `codex-root` at base
`e91f1fa36dbbc63b961c5b646c256e5372bd5717` after the llm-core-scoped planner
reported no blocker. The all-authority planner remains independently blocked by
the ongoing AIFSD authority's missing
`packages/aifsd/docs/final-architecture/tasks/llm-core-v2-publication-evidence.md`
required-reading file; this task does not own that private documentation.

Admission recheck: the all-authority and llm-core planners both recognised this
task as the sole active task with no blocker. Implementation then entered
`in_progress` under the same lease and write boundary.

Implementation: added one deterministic package-local renderer shared by check
and write modes, exact inventory-row validation, graph and governance
invariants, active ownership/checkout validation, package and documentation
gate integration, and adversarial fixture coverage for the acceptance surface.

Verification: the architecture suite passes 70 tests; focused ESLint, package
source and test typechecks, SLOC validation and `git diff --check` pass.

Independent review correction: replacement targets now require a Git blob in
the authority repository's `HEAD` rather than index membership; `forward_to`
requires a configured non-local authority; table-unsafe evidence milestones
are rejected; and concurrent-scope evidence matches complete task-ID tokens.
Each reproduced defect has a focused regression fixture.

Follow-up review correction: active labels are parsed only within `## Work log`;
an absent optional AIFSD authority no longer becomes a public build dependency
while a mounted missing target still fails; planner-owned non-empty write-scope
validation is reused; malformed present `owner_kind` values are rejected; and
the validator remains below 500 physical lines, so no SLOC waiver is required.
Focused fixtures cover handoff-label duplication, optional-versus-mounted
foreign authority, missing/empty/blank scopes and numeric/object owner kinds.

Final review correction: swarm delegation now accepts only `none` or complete
documented lineage. Graph validation rejects structural and ADR defects without
mistaking ordinary candidate readiness, priority deferral or inactive conflicts
for invalid authority. Governance repair removed null optional metadata, added
exact required-reading authority and reconciled stale conflict edges before the
canonical projection was regenerated.

## Handoff

Base SHA: `e91f1fa36dbbc63b961c5b646c256e5372bd5717`.

Execution mode: shared canonical checkout on `main`; the active
`adapter-coding-agent-integration` scope is disjoint and current package source
and test typechecks pass.

Changed surface: package-local STATUS renderer/validator, adversarial
architecture fixtures, package scripts, repository documentation gate, this
task record and the coordinator-owned lifecycle projection in `STATUS.md`.

Independent review: the first pass reproduced four defects involving staged
replacement authority, unknown/local forward authorities, Markdown table
delimiters and substring task-ID evidence. All were corrected with focused
regressions. Re-review found no remaining actionable task-owned defect and
confirmed the earlier 53-test baseline. A subsequent review supplied five
further findings; all now have focused corrections and the suite passes 60
tests before the final delegation and graph-readiness regressions were added.
Final follow-up reviews found no remaining actionable defect and independently
confirmed structural graph enforcement, candidate scheduling semantics,
mount-boundary behaviour, SLOC, typecheck, lint and diff evidence.
