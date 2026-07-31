# Architecture v2 implementation task briefs

Each file in this directory is the durable source of truth for one bounded implementation task.

Cross-swarm allocation, claims, worktree isolation, handoffs, and deterministic
integration are defined in [`../COORDINATION.md`](../COORDINATION.md).

## Lifecycle

`proposed` → `ready` → `claimed` → `in_progress` → `review` → `done`

Use `blocked` when a named dependency or unresolved decision prevents progress. Use `cancelled` only when the coordinator removes the task.

## Language stage

The language stage runs before specification work. Its common-journey fixtures
and exact term map are architecture inputs, not a final documentation cleanup.
New capability tasks must not invent public names while `language-vocabulary`
is unresolved.

## Qualification stage

ADR-013 preserves the remaining operational work exposed by the 19-framework
assessment without turning `llm-core` into a hosted platform. Qualification
tasks may proceed after the language rollout when their stated dependencies
are done. They do not block the specification sequence unless a task declares
that dependency explicitly. Every runtime, workspace, or protocol adapter
must declare exact supported versions, semantic loss and its durable-state
posture before a separate publication task adds a package entrypoint.

## Integrations stage

ADR-014 adds a typed connector lifecycle without collapsing MCP, A2A, SaaS,
authorization and usage-provider semantics into one plugin API. Connector
contracts and authorization references precede concrete protocol/provider
adapters. Credential values remain host/platform owned, and every meaningful
connector action still enters the ADR-005 control path.

## Applications stage

Desktop and mobile are delivery applications over a shared client contract,
not feature folders inside `llm-core`. The client task follows specification,
authorization and cost-intelligence gates. Each platform task must record its
own secure-storage, authorization callback, offline synchronization,
background execution, signing/update and supported-OS posture before it can be
made ready.

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

Renamed completed tasks may contain `legacy_id` plus historical `branch` and
`worktree` values. Those fields are immutable execution provenance, not active
planning terminology.
