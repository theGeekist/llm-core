> **Credit & provenance:** Continues the Architecture v2 planning and review
> work prepared by `codex-root` from the framework research, accepted ADRs and
> implementation evidence through `c041792`. Last materially updated by
> `codex-root` on 2026-08-04 for package-document routing and context pruning;
> Git retains earlier snapshots.

# Plan Architecture v2

Use `/Users/jasonnathan/Repos/@theGeekist/llm-core`, verified with
`git rev-parse --show-toplevel`; use another checkout only when an active task
names it.

## Stable boundary

The Architecture v2 kernel milestone is `9920425`. Later corrections and
continuing work do not move that historical completion boundary. This handoff
does not copy live task counts, active ownership, export totals, or readiness;
read those from task front matter and `STATUS.md` at the time of work.

`llm-core` is a typed control and interoperability kernel—not a hosted platform,
durable-work service, secret manager, billing system, generic plugin API or
SDLC product. Capability rules live in `features`, cross-capability sequencing
in `application`, and framework/protocol mappings in qualified adapters.

## Authoritative documents

- [`PLAN.md`](../final-architecture/PLAN.md):
  completed kernel evidence; read only for historical questions.
- [`ROADMAP.md`](../final-architecture/ROADMAP.md):
  continuing programme grouping, admission and priorities; read when selecting
  work. Task front matter owns the exact graph.
- [`STATUS.md`](../final-architecture/STATUS.md):
  current projection; inspect the summary or relevant task row.
- [`COORDINATION.md`](../final-architecture/COORDINATION.md):
  claim, concurrency, review and integration procedure.
- [`tasks/`](../final-architecture/tasks/): task
  front matter is authoritative for state, dependencies, scope and checks.
- [`decisions/`](../final-architecture/decisions/):
  rationale and architecture constraints.

## Resume

If asked what comes next, run:

```sh
bun run tasks:plan --authority all
```

Inspect current task front matter, dependency state, conflicts and active
scopes, then use `ROADMAP.md` for programme grouping and priority advice. After
selection run `bun run tasks:context -- <authority>/<task-id>` and open every
generated item before proposing a claim. Do not infer readiness from this
handoff.
