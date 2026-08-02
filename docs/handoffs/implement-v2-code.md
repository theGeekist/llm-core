> **Credit & provenance:** Replaces the task-named implementation handoffs.
> It preserves their Architecture v2, specification, operational, runtime, and
> integration constraints while intentionally avoiding assignment to a single
> task. Prepared by `codex-root` on 2026-08-01.

# Implement Architecture v2 code

## Purpose

Use this handoff for any Architecture v2 implementation conversation. It is a
durable role brief, not a task assignment: the user may give a task ID or ask
what is ready next. In the latter case, inspect task state/dependencies and
identify the safe next task. The primary implementer owns the selected task's
claim-through-`done` lifecycle; the authoritative task brief supplies exact
scope, dependencies, ADRs, and verification commands.

Start with [the shared plan](./plan-v2-arch.md), then read:

1. [repository guidance](../../AGENTS.md);
2. [coordination](../../packages/llm-core/internal/final-architecture/COORDINATION.md);
3. [task lifecycle](../../packages/llm-core/internal/final-architecture/tasks/README.md);
4. the assigned task under
   [`packages/llm-core/internal/final-architecture/tasks/`](../../packages/llm-core/internal/final-architecture/tasks/);
5. every ADR named by that task; and
6. the source/tests in its `read_scope`.

## Repository map

The changed package is `packages/llm-core`, not the repository root:

```text
packages/llm-core/
├── index.ts                 # curated root API
├── src/features/            # capability-owned behavior and public fronts
├── src/application/         # cross-feature orchestration and runtimes
├── src/adapters/            # qualified framework/protocol boundaries
├── src/specifications/      # explicit specification extension front
├── tests/                   # behavior, architecture, conformance, adapters
└── internal/final-architecture/ # ADRs, status, tasks, coordination
```

Put new capability rules in a feature, cross-feature sequencing in
`application`, and framework/protocol code behind `adapters`. Import another
feature through its published front; do not deep-import its internals.

## Working contract

- Begin with `git status --short`; preserve unrelated staged, unstaged, and
  untracked work. Never reset, rebase, checkout, or discard it.
- Work only in the assigned task's `write_scope`. A `read_scope` grants no
  write authority. Keep one writer per file across a swarm.
- Do not add compatibility shims, aliases, broad root exports, or a generic
  framework/plugin/team model. This package is pre-user and favors one
  coherent final design.
- Preserve `MaybePromise`; do not normalize sync-or-async flows to Promise.
  Use composition only where it clarifies a genuinely linear flow.
- Keep portable data separate from current execution authority, credentials,
  evidence, estimates, framework-native values, and durable runtime state.
- A qualified adapter declares exact versions, supported operations, loss, and
  source/lifecycle posture. Parsing does not imply support or publication.

## Swarming and cadence

The parent task owner may delegate disjoint subpaths to children, but only the
parent owns the task lease, task-status changes, and integration. Children do
not edit shared files, change task status, merge, cherry-pick, or integrate.

The cadence is fixed: claim → implement → verify → submit the **uncommitted**
task-scoped diff and record handoff → mark `review` → user relays review →
address actual findings → re-review → commit only after reviewer pass → mark
`done` → select or claim the next task. Before review, report the task's
recorded `base_sha`, changed-file list, exact verification outcomes, semantic
loss/risks, and any shared-file request. After approval, report the committed
SHA and clean task scope.

## Current transition

The completed foundation includes core, language rollout, and specification
contracts/compiler/authority/API. The next work is selected from the shared
plan's two lanes: independent specification adapter qualifications, or
operational/runtime/integration qualification. Do not infer readiness from this
summary; check the selected task and current status at claim time.
