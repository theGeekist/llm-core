---
architecture_version: 2
id: TASK-ID
title: Task title
stage: STAGE
status: proposed
priority: critical
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

Claim only if dependencies are done, ADRs accepted and no active write scope
overlaps. Set owner, owner kind, base SHA, lease and status. Independent
Codex/Claude Code processes use separate worktrees. An expired lease requires
coordinator review before reassignment.

The coordinator creates the branch and worktree. Workers do not rebase, merge,
cherry-pick, or integrate. Workers finish with a task commit at `review`; only
the reviewer marks `done`.

Allowed states:

```text
proposed -> ready -> claimed -> in_progress -> review -> done
                               \-> blocked
proposed/ready/blocked -> cancelled
```

## Work log

## Blocker

## Handoff

### Result

### Decisions applied

### Files changed

### Verification evidence

### Deviations

### Remaining risks

### Recommended next task
