# Architecture v2 handoffs

These handoffs are the starting context for the active Architecture v2 swarm.
They replace the historical language-rollout, content-review, simplification,
and earlier architecture-review handoffs on 1 August 2026. The previous files
remain available in Git history; their relevant conclusions and provenance are
carried into the new plan.

Read [the shared plan](./plan-v2-arch.md) first, then use the durable role
brief appropriate to the conversation:

- [Implementation](./implement-v2-code.md)
- [Review](./review-v2-code.md)

## Handoff rules

- `packages/llm-core/internal/final-architecture/tasks/*.md` is authoritative
  for task state, dependencies, scope, and verification. `STATUS.md` is a
  readable projection only.
- Preserve the credit/provenance block when extending a handoff. Add a dated
  note for a material new conclusion; do not present inherited analysis as new.
- Start with `git status --short`, preserve unrelated changes, and work only in
  the task's `write_scope`. The user supplies a task ID when they have one, or
  asks what is ready next and relays review results. The primary implementer
  owns its selected task's claim-through-`done` status; the reviewer does not
  change task state.
- Task submissions are intentionally **uncommitted**. Review the task-scoped
  working-tree diff against the task's recorded `base_sha`; commit only after
  a passing review, immediately before marking the task `done`.
- A review reports only real actionable severity findings. Put each `P0`–`P2`
  finding in its own copyable `md` code block; ordinary status prose stays
  outside code blocks.
- Handoffs guide a conversation. They do not replace the task brief, ADRs,
  source/tests, or the [swarm protocol](../../packages/llm-core/internal/final-architecture/COORDINATION.md).

File names use `<verb>-<noun>-<scope>.md`; permitted verbs are `plan`,
`implement`, `review`, and `research`.
