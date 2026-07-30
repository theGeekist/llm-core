# Architecture v2 — Codex swarm coordination

This file defines how the Codex coordinator and delegated subagents execute the
Architecture v2 program without relying on shared conversation state.

## Allocation

Claude Code's completed api-baseline and core-model-runtime contributions remain historical.
After core-model-runtime, every remaining task is allocated to the Codex/coordinator swarm.
The coordinator delegates disjoint subtasks to child agents while retaining the
task lease, review responsibility and integration authority.

## Dependency-safe execution order

- **Architecture and baseline:** `architecture-decisions` and `api-baseline`
  may run concurrently.
- **Core contracts:** `core-contracts` runs after `architecture-decisions`.
- **Core runtime slices:** `core-tool-control-events` and `core-model-runtime`
  run concurrently. `core-state-interventions` and `core-ai-sdk-packaging` may
  then run concurrently after their gates. `core-agent-runner` follows the
  state and model slices.
- **Core adapters and interactions:** `core-ai-sdk-adapter` runs after the
  packaging gate and establishes one green AI SDK 7 provider/UI compatibility
  baseline. `core-interactions` follows the state, runner and AI SDK slices.
- **Core convergence:** `core-convergence` integrates the core tasks in the
  deterministic order below.
- **Capabilities:** after `core-convergence`,
  `capabilities-context-artifacts` and
  `capabilities-runtime-conformance` may run concurrently.
  `capabilities-evaluation` follows `capabilities-context-artifacts`.
- **Language:** after capabilities, the language tasks audit, decide and
  atomically replace the public language. Specification work remains blocked
  until `language-rollout` passes.
- **Specifications and adapters:** specification work begins after
  `language-rollout`. Adapter implementations begin after the specification
  API is published; their publication tasks remain serialized.

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

For the core stage, the expected order is:

```text
api-baseline
core-contracts
core-tool-control-events
core-model-runtime
core-state-interventions
core-agent-runner
core-ai-sdk-packaging
core-ai-sdk-adapter
core-interactions
core-convergence
```

After each integration, the coordinator runs the receiving task's focused
verification. `core-convergence` runs the complete verification baseline. A failed
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

For renamed historical tasks, `legacy_id`, `branch` and `worktree` are
immutable provenance. They retain the exact values used when the work ran,
even when those values contain the retired numbering scheme. Terminology
audits must exclude these provenance fields; current task IDs, dependencies
and planning prose still use descriptive names.
