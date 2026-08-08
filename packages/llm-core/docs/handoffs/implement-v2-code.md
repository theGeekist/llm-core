> **Credit & provenance:** Continues the Architecture v2 implementation guidance
> prepared by `codex-root` from accepted ADRs, completed tasks and prior reviews.
> Last materially updated by `codex-root` on 2026-08-03 for source-layout
> governance and context pruning; Git retains earlier snapshots.

# Implement Architecture v2 code

Work in `/Users/jasonnathan/Repos/@theGeekist/llm-core`; verify the root before
acting. This is a role brief, not a task assignment.

## Load only what the task needs

1. Run `bun run tasks:plan --authority all` before selecting or claiming work.
2. Run `bun run tasks:context -- <authority>/<task-id>` for the selected task.
3. Open every generated governing item, the selected brief, every
   `required_reading` entry, every named ADR and every dependency brief.
4. Use `read_scope` for additional investigation as needed. It is not a
   substitute for the required context pack.
5. Read `ROADMAP.md` only when selecting work. Read historical material for the
   obligation stated in its `required_reading` reason, not as newer authority.

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
  portable-data boundaries and exact supported, unsupported or not-applicable
  external-operation contracts.
- Apply the current backend or frontend slice architecture skill when the task
  touches that surface. Keep user-facing strings feature-owned, machine
  identifiers language-neutral and runtime configuration resolved at
  application composition.
- Target roughly 500 SLOC. Record the lightweight `approximately 500 lines`
  waiver for 501 through 600 lines; only work above 600 enters the stronger
  decomposition or follow-up path.
- Request lifecycle transitions from the coordinator; never edit lifecycle
  state independently.

Submit an uncommitted task-scoped diff for review. Report the base SHA, execution
mode, concurrent scopes, changed files, commands/results, deviations, remaining
risks and shared-file requests. After approval, the coordinator commits or
integrates and records the atomic task/STATUS completion.

Current task state comes from task front matter, not this handoff.
