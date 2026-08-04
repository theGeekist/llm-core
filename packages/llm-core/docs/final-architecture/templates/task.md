---
architecture_version: 2
id: TASK-ID
title: Task title
stage: STAGE
status: proposed
priority: critical
evidence_milestone: null
replaced_by: []
forward_to: []
preferred_owner_kind: codex
owner: null
owner_kind: null
lease_started_at: null
lease_expires_at: null
base_sha: null
branch: null
worktree: null
depends_on: []
decision_dependencies: []
conflicts_with: []
write_scope: []
read_scope:
  - packages/llm-core/src/**
review_owner: coordinator
updated_at: YYYY-MM-DD
---

# TASK-ID — Task title

Choose `stage`, `status`, `priority`, `preferred_owner_kind` and `owner_kind`
only from the canonical vocabularies in [`../tasks/README.md`](../tasks/README.md).
Use `replaced_by` only for an existing local task ID or committed
`<package-name>/<task-id>` replacement. Use `forward_to` for a planned,
uncommitted cross-package authority in `<package-name>/<task-id>` form.

## Objective

One testable outcome.

## Why this exists

## Inputs

## In scope

## Out of scope

## Contract and naming constraints

## File ownership

Only edit the front matter, declared write scope, work log and handoff. The
brief above the work log is immutable while claimed.

## Acceptance criteria

- New or moved code follows the shallow layout and naming rules in
  `COORDINATION.md`.
- New or materially changed hand-written source/test modules satisfy the
  500-SLOC rule, or the handoff records a coordinator-approved waiver and named
  follow-up task.

## Verification

```sh
bun run typecheck:packages
```

## Required evidence

- Changed file list.
- Verification command, exit status and concise result.
- Remaining known loss.
- Commit SHA or patch reference when applicable.
- Proposed ADR if a new cross-cutting decision appeared.

## Claim protocol

Follow [`../COORDINATION.md`](../COORDINATION.md) and the metadata contract in
[`../tasks/README.md`](../tasks/README.md). Do not restate those rules here.

## Work log

Record existing replacements or planned forward targets when cancelled. For
active work use the canonical labels:

```text
Execution mode: shared-checkout | dedicated-worktree
Execution rationale: <non-empty explanation>
Concurrency evaluation: <ongoing task IDs or none; start alongside | wait | no concurrency; boundary rationale>
Concurrent task scopes: none | <task IDs and disjoint scopes>
Swarm delegation: none | <parent runtime/owner> -> <child runtime/owner>: <role>; <disjoint subpath/output or review output>
```

## Blocker

## Handoff

### Result

### Decisions applied

### Files changed

### Verification evidence

### Deviations

### Remaining risks

### Recommended next task
