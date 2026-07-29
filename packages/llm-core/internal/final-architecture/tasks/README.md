# Architecture v2 implementation task briefs

Each file in this directory is the durable source of truth for one bounded implementation task.

Cross-swarm allocation, claims, worktree isolation, handoffs, and deterministic
integration are defined in [`../COORDINATION.md`](../COORDINATION.md).

## Lifecycle

`proposed` → `ready` → `claimed` → `in_progress` → `review` → `done`

Use `blocked` when a named dependency or unresolved decision prevents progress. Use `cancelled` only when the coordinator removes the task.

## Claiming a task

1. Confirm every `depends_on` task is `done`.
2. Confirm every decision dependency is accepted.
3. Change `status` to `claimed`.
4. Add the owner and timestamp to the work log.
5. Work only inside `write_scope`.

Before editing a shared file, record the requested change in the handoff for the integration owner. A task may be reassigned when its work log shows no active lease or the coordinator explicitly releases it.

The coordinator creates the task branch and worktree. Workers must not rebase,
merge, cherry-pick, or integrate their own work.

## Completing a task

1. Record verification commands and outcomes.
2. List files changed and shared-file requests.
3. Commit the task work and record its SHA.
4. Set `status` to `review`.
5. The coordinator reviews it and changes the status to `done`.

`STATUS.md` is a projection for humans. The task brief remains authoritative.
