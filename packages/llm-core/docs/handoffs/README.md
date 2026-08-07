# Architecture v2 handoffs

Use `/Users/jasonnathan/Repos/@theGeekist/llm-core`, verified with
`git rev-parse --show-toplevel`. Another checkout is valid only when the active
task names it; sibling repositories, attachments and historical worktrees are
context, not project state.

## Choose the smallest context set

Begin every task-facing session from the canonical checkout:

```sh
bun run tasks:plan --authority all
bun run tasks:context -- <authority>/<task-id>
```

Open every item in the generated context pack. In particular,
`required_reading` is an ordered consumption obligation; `read_scope` is only
additional inspection authority.

- Planning or “what next?”: [planning handoff](./plan-v2-arch.md), the planner
  output and then the relevant `ROADMAP.md` programme section.
- Implementation: [implementation handoff](./implement-v2-code.md) and the
  complete generated context pack.
- Review: [review handoff](./review-v2-code.md), the complete generated context
  pack and submitted diff.
- Claim, concurrency or integration: additionally read
  [`COORDINATION.md`](../final-architecture/COORDINATION.md).
- Historical kernel questions only: read
  [`PLAN.md`](../final-architecture/PLAN.md).

Task front matter is authoritative. `STATUS.md` is a generated human projection;
inspect only its summary or relevant rows unless validating the projection.

## Handoff maintenance

Keep one compact provenance block naming inherited work, source basis, last
material contributor and date. Git is the chronology; handoffs route work and
never duplicate task acceptance, ADRs, coordination rules or a prose changelog.
Name them `<verb>-<noun>-<scope>.md` using `implement`, `review`, `research` or
`plan`.
