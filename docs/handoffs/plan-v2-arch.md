> **Credit & provenance:** Continues the Architecture v2 planning and review
> work prepared by `codex-root` from the framework research, accepted ADRs and
> implementation evidence through `c041792`. Last materially updated by
> `codex-root` on 2026-08-03 for source-layout governance and context pruning;
> Git retains earlier snapshots.

# Plan Architecture v2

Use the canonical checkout:
`/Users/jasonnathan/Repos/@theGeekist/llm-core`. Verify it with
`git rev-parse --show-toplevel`; use another checkout only when an active task
brief names it.

## Current state

The Architecture v2 kernel is complete at `9920425`, with 30 qualified ESM
runtime/declaration fronts and `@wpkernel/pipeline@1.2.0`. Receipt
reconciliation landed at `bb7f7f7`; five specification adapters were qualified
at `cf3347d` and recorded complete at `c041792`. No task is currently active.

`llm-core` is a typed control and interoperability kernel—not a hosted platform,
durable-work service, secret manager, billing system, generic plugin API or
SDLC product. Capability rules live in `features`, cross-capability sequencing
in `application`, and framework/protocol mappings in qualified adapters.

## Authoritative documents

- [`PLAN.md`](../../packages/llm-core/internal/final-architecture/PLAN.md):
  completed kernel evidence; read only for historical questions.
- [`ROADMAP.md`](../../packages/llm-core/internal/final-architecture/ROADMAP.md):
  continuing programme grouping, admission and priorities; read when selecting
  work. Task front matter owns the exact graph.
- [`STATUS.md`](../../packages/llm-core/internal/final-architecture/STATUS.md):
  current projection; inspect the summary or relevant task row.
- [`COORDINATION.md`](../../packages/llm-core/internal/final-architecture/COORDINATION.md):
  claim, concurrency, review and integration procedure.
- [`tasks/`](../../packages/llm-core/internal/final-architecture/tasks/): task
  front matter is authoritative for state, dependencies, scope and checks.
- [`decisions/`](../../packages/llm-core/internal/final-architecture/decisions/):
  rationale and architecture constraints.

## Resume

If asked what comes next, inspect current task front matter and active scopes,
then use `ROADMAP.md`. Source-layout normalization is the first gate; runtime
remediation follows:

```text
architecture-source-layout-normalization
  -> runtime-tool-execution-decomposition
      -> runtime-tools-front-boundary
```

Release/status hardening, adapter publication, connector characterization and
product work are independently selectable only when their task dependencies and
admission gates pass. Do not infer readiness from this handoff.
