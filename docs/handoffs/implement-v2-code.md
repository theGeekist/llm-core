> **Credit & provenance:** Continues the Architecture v2 implementation guidance
> prepared by `codex-root` from accepted ADRs, completed tasks and prior reviews.
> Last materially updated by `codex-root` on 2026-08-03 for source-layout
> governance and context pruning; Git retains earlier snapshots.

# Implement Architecture v2 code

Work in `/Users/jasonnathan/Repos/@theGeekist/llm-core`; verify the root before
acting. This is a role brief, not a task assignment.

## Load only what the task needs

1. Read repository guidance and the selected task brief.
2. Read only the ADRs named by that task and source/tests in its `read_scope`.
3. Read [`COORDINATION.md`](../../packages/llm-core/internal/final-architecture/COORDINATION.md)
   when claiming, running beside another task, delegating, reviewing or
   integrating.
4. Read [`ROADMAP.md`](../../packages/llm-core/internal/final-architecture/ROADMAP.md)
   only when selecting work. `PLAN.md` is completed history.

## Implement

- Begin with `git status --short`; preserve unrelated work.
- Treat `write_scope` as authority and `read_scope` as read-only.
- Follow the task's dependencies, acceptance criteria and exact verification.
- Keep capability rules in features, cross-capability sequencing in
  application, and framework/protocol mappings in adapters; reject deep feature
  imports.
- Use the shallow owner/file layout and naming rules in `COORDINATION.md`;
  prefer descriptive prefixes to classificatory subfolders.
- Preserve `MaybePromise`, authority checks, controlled-effect guarantees,
  portable-data boundaries and explicit semantic loss.
- Follow the 500-SLOC rule and the release/publication gates named by the task.
- Request lifecycle transitions from the coordinator; never edit lifecycle
  state independently.

Submit an uncommitted task-scoped diff for review. Report the base SHA, execution
mode, concurrent scopes, changed files, commands/results, deviations, remaining
risks and shared-file requests. After approval, the coordinator commits or
integrates and records the atomic task/STATUS completion.

Current task state comes from task front matter, not this handoff.
