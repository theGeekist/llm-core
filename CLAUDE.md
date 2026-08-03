# Claude Code Instructions

Read and follow [`AGENTS.md`](AGENTS.md) first.

For backend architecture work load `/backend-slice-architecture`; for frontend
work load `/frontend-slice-architecture`; load both when a task crosses the
boundary. Delegated architecture work follows the same requirement.

For Architecture v2 work, start from the selected task brief, its named ADRs and
its `read_scope`. Task front matter owns state and scope.

- Use [`ROADMAP.md`](packages/llm-core/internal/final-architecture/ROADMAP.md)
  only to select continuing work.
- Use [`COORDINATION.md`](packages/llm-core/internal/final-architecture/COORDINATION.md)
  for claims, concurrency, delegation, review and integration.
- [`PLAN.md`](packages/llm-core/internal/final-architecture/PLAN.md) is completed
  history; [`STATUS.md`](packages/llm-core/internal/final-architecture/STATUS.md)
  is a generated projection.

Do not self-assign planned work or edit lifecycle state independently. Preserve
unrelated changes, obey `write_scope`, and leave enough task evidence for a new
worker to resume without conversation history. New code follows the shallow
layout, kebab-case naming and 500-SLOC rules in `COORDINATION.md`.
