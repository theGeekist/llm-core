# Architecture v2 — Codex swarm coordination

This file defines how the Codex coordinator and delegated subagents execute the
Architecture v2 program without relying on shared conversation state.

## Allocation

Claude Code's completed I0-010 and P0-120 contributions remain historical.
After P0-120, every remaining task is allocated to the Codex/coordinator swarm.
The coordinator delegates disjoint subtasks to child agents while retaining the
task lease, review responsibility and integration authority.

## Dependency-safe execution waves

1. Wave 0: `A0-001` and `I0-010` may run concurrently.
2. Wave 1: `P0-100` runs after A0.
3. Wave 2: `P0-110` and `P0-120` run concurrently.
4. Wave 3: Codex-owned `P0-130` and `P0-155` may run concurrently after their
   gates;
   `P0-140` follows `P0-130` and the model slice.
5. Wave 4: `P0-160` runs after the packaging gate and establishes one green
   AI SDK 7 provider/UI compatibility baseline; `P0-170` then runs after the
   state, runner and AI SDK compatibility slices.
6. Wave 5: `P0-150` integrates P0 in the deterministic order below.
7. Wave 6: only after `P0-150` is done, `P1-210` and `P1-230` may begin
   concurrently through separate Codex agents. `P1-220` follows `P1-210`.

## Claim protocol

The architecture coordinator is the only authority that changes a task from
`proposed` to `ready` and the only writer of `STATUS.md`.

For each assigned task, the coordinator:

1. verifies dependencies are `done` and ADRs are accepted;
2. creates a dedicated worktree and task branch from the recorded base SHA;
3. populates `owner`, `owner_kind`, lease, base SHA, branch, and worktree;
4. changes the task to `claimed`; and
5. gives the worker the task brief, accepted ADRs, this file, and no hidden
   conversational requirements.

The worker then changes only its own task file from `claimed` to `in_progress`.
An agent may not claim a second task while its first task is active unless the
coordinator explicitly records the exception.

A dependent task's base SHA must contain the integrated commits of every
dependency marked `done`. On lease expiry or reassignment, the coordinator
records the release and issues a new base SHA, worktree, and lease.

## Isolation rules

- One task, one branch, one worktree, one accountable parent worker.
- Workers edit only `write_scope`; `read_scope` grants no write authority.
- Root exports, manifests, lockfiles, shared fixtures, canonical plans, and
  legacy deletion remain integration-owned unless a brief explicitly grants
  them.
- Workers do not rebase, merge, cherry-pick, or modify another task branch.
- A newly discovered cross-cutting decision blocks the task and becomes an ADR.
- Subagents report to the task owner; they never integrate independently.
- Nested swarms inherit the parent's write scope. The parent records disjoint
  child subpaths before delegation, and only one worker may write a file.

## Handoff contract

Every task presented for review must contain:

- the commit SHA produced from the assigned worktree;
- confirmation that the task worktree is clean at that SHA;
- the exact changed-file list;
- verification commands, exit codes, and concise results;
- ADRs applied and any deviations;
- remaining risks and known semantic loss; and
- shared-file changes requested from the integration owner.

Every shared-file request names the exact path and intended change.

The task owner stops at `review`. Only the coordinator marks it `done`, and
only after its reviewed commit is integrated into the coordinator branch.

## Deterministic integration

The coordinator integrates only reviewed task commits and never uncommitted
worker directories. Ready commits are integrated in topological order; ties are
resolved by ascending task ID.

For P0, the expected order is:

```text
I0-010
P0-100
P0-110
P0-120
P0-130
P0-140
P0-155
P0-160
P0-170
P0-150
```

After each integration, the coordinator runs the receiving task's focused
verification. `P0-150` runs the complete verification baseline. A failed
integration returns to the originating task; the coordinator does not repair
capability internals inside the integration commit.

## Progress authority

Project state is recoverable from, in order:

1. accepted ADRs;
2. task front matter and handoff;
3. task branch commits;
4. `STATUS.md` as the coordinator-maintained projection.

Chat transcripts, model memory, and uncommitted worktree state are never
required inputs.
