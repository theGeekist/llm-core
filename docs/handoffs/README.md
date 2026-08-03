# Architecture v2 handoffs

Use only the canonical checkout:

```text
/Users/jasonnathan/Repos/@theGeekist/llm-core
```

Verify it with `git rev-parse --show-toplevel`. A different checkout is valid
only when the active task brief names it; sibling repositories, attachments and
historical worktrees are context, not project state.

## Choose the smallest context set

- Planning or “what next?”: [planning handoff](./plan-v2-arch.md), then
  [`ROADMAP.md`](../../packages/llm-core/internal/final-architecture/ROADMAP.md)
  and the relevant task front matter.
- Implementation: [implementation handoff](./implement-v2-code.md), the selected
  task, its named ADRs and its `read_scope`.
- Review: [review handoff](./review-v2-code.md), the selected task, its named
  ADRs and submitted diff.
- Claim, concurrency or integration: additionally read
  [`COORDINATION.md`](../../packages/llm-core/internal/final-architecture/COORDINATION.md).
- Historical kernel questions only: read
  [`PLAN.md`](../../packages/llm-core/internal/final-architecture/PLAN.md).

Task front matter is authoritative. `STATUS.md` is a generated human projection;
inspect only its summary or relevant rows unless validating the projection.

## Handoff maintenance

Every handoff keeps one compact provenance block naming inherited work, source
basis, last material contributor and date. Git is the chronology; do not append
a prose changelog. Handoffs route work and never duplicate task acceptance,
ADRs or coordination rules.

Name handoffs `<verb>-<noun>-<scope>.md`; supported verbs are `implement`,
`review`, `research` and `plan`.
