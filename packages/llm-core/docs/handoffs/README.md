# Architecture v2 handoffs

Use `/Users/jasonnathan/Repos/@theGeekist/llm-core`, verified with
`git rev-parse --show-toplevel`. Another checkout is valid only when the active
task names it; sibling repositories, attachments and historical worktrees are
context, not project state.

## Choose the smallest context set

- Planning or “what next?”: [planning handoff](./plan-v2-arch.md), then
  [`ROADMAP.md`](../final-architecture/ROADMAP.md)
  and the relevant task front matter.
- Implementation: [implementation handoff](./implement-v2-code.md), the selected
  task, its named ADRs and its `read_scope`.
- Review: [review handoff](./review-v2-code.md), the selected task, its named
  ADRs and submitted diff.
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
