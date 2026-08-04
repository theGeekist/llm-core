# Architecture v2 — Task coordination

This file owns claim, concurrency, review and integration procedure. Task front
matter owns exact state, dependencies and scope; [`ROADMAP.md`](ROADMAP.md)
owns programme grouping, admission and priority advice.

## Select and claim

Work is selected one candidate at a time with no preset serial or parallel
preference. Before claiming, the coordinator:

1. verifies dependencies and decision gates;
2. inspects `git status` and every active task;
3. compares conflicts, write scopes, generated outputs and staging paths;
4. records whether the candidate starts alongside current work or waits; and
5. assigns one primary owner, lease, base SHA and execution location.

DAG readiness alone does not authorize a claim. Overlap is serialized or
repartitioned; a separate checkout never cures shared ownership.

The coordinator owns every lifecycle transition and is the only writer of
`STATUS.md`. It changes task front matter and regenerates STATUS in the same
logical edit. Workers request `in_progress`, `review` or `blocked`; they never
change lifecycle fields themselves. The required metadata and work-log labels
are defined in [`tasks/README.md`](tasks/README.md).

## Execution boundaries

- One task has one accountable primary owner and logical write lease.
- The primary checkout and current coordinator branch are the default.
- Disjoint tasks may share that checkout; one writer per file is absolute.
- Shared manifests, lockfiles, generated artifacts and staging paths count as
  writes and must be included in the boundary check.
- A dedicated worktree is a last resort for otherwise-disjoint risky or bulk
  work, or clean final evidence that genuinely needs isolation. Record why.
- A task-local swarm is optional. Children inherit the task scope, receive
  disjoint subpaths/outputs and never claim, integrate or broaden work.
- Workers edit only `write_scope`, do not switch branches, and do not rebase,
  merge or cherry-pick.
- Re-evaluate boundaries when another candidate is considered, scope changes or
  an unexpected shared-file edit appears. Stop until ownership is disjoint.
- Final repository-wide or publication evidence uses a quiescent shared
  checkout or the task's justified dedicated worktree.

## Cross-runtime swarm

Codex and Claude Code are peer worker runtimes. Either may hold a task lease,
run its native child agents, or dispatch a task-local child through the other
runtime's MCP bridge. A cross-runtime child is part of the same swarm; it does
not create a second coordinator or a separate task claim.

- Dispatch only a bounded role with a named output, review question or disjoint
  write scope; include the relevant task brief, base SHA and current ownership
  inventory.
- The primary owner retains the lease and is accountable for every child result,
  including work delegated by a child through the reciprocal bridge.
- Record each dispatch lineage in the work log as
  `<parent runtime/owner> -> <child runtime/owner>: <role>; <scope or output>`.
- Cross-runtime children may use their native agents or the reciprocal bridge
  when useful, but inherit the parent task's authority, write boundary and
  verification requirements.
- A child returns evidence and a concise handoff to its parent. Only the
  primary owner proposes lifecycle changes; only the coordinator records them.

## Size rule

New hand-written production and test modules must not exceed 500 physical source
lines. Generated, vendored and snapshot exclusions are centrally configured. A
legacy exception is pinned by ceiling and content digest; any content change
requires reduction to the limit or a versioned coordinator waiver with a named
follow-up. The threshold is a cohesion signal, not permission for arbitrary
file splitting.

## Source layout and names

- Use kebab-case and a descriptive noun or noun-role filename.
- Prefer `src/<layer>/<capability-or-integration>/<file>`; add production
  nesting only for a real independently owned boundary, not a category.
- Prefix related filenames instead of adding classificatory folders: for
  example `storage-cache.ts` and `media-transcription.ts`.
- `public.ts` is an internal feature/application front. `index.ts` is reserved
  for package or published-subpath entrypoints. `runtime.ts` denotes a
  privileged live surface, not a generic implementation module.
- Do not introduce vague `common`, `misc`, `shared`, `utils` or generic
  `helpers` modules; name the owned concept. Tests mirror the source owner, with
  extra depth normally limited to fixtures or generated data.

Architecture tests enforce the mechanically decidable subset. A justified
exception is recorded in the owning task rather than normalized into a broader
rule.

## Review and completion

Review begins from an uncommitted task-scoped diff. The submission records:

- base SHA, execution mode and concurrent scopes;
- changed files and shared-file requests;
- verification commands and results;
- ADRs, deviations, known loss and remaining risk; and
- any task-local delegation.

After approval:

- **Shared checkout:** the coordinator commits only approved task paths on the
  current branch, leaving unrelated diffs untouched.
- **Dedicated worktree:** the approved task commit is created on its isolated
  ref and integrated by the coordinator.

The coordinator runs receiving verification, records the approved SHA, then
changes the task to `done` and regenerates STATUS. Task-frontmatter changes and
STATUS form one governance set: if committed, it includes every source task
needed for an exact projection. Pending governance state is excluded from an
implementation commit unless the complete set is intentionally included.

## Qualification gates

Task-focused checks supplement, never replace, package gates.

- Package behavior changes pass `packages/llm-core` `release:build`.
- Export, build/declaration, TypeScript mapping, package-smoke or public-doc
  changes also pass the packed consumer, documentation and formatting commands
  named by the task.
- `release:qualify:llm-core` is the only supported npm-publication gate. Both
  local `publish:npm` and tagged release workflows delegate to it.
- Every newly published conditional surface registers a durable, non-skipping
  qualifier. Later releases rerun every active registration.
- Private applications use equivalent package-local gates; packing is evidence,
  not publication authority.

## Recoverability

Project state is recoverable from accepted ADRs, task front matter, approved
commits and the generated STATUS projection. Chat history and uncommitted
worktree state are never required inputs. Historical `legacy_id`, `branch` and
`worktree` values remain immutable provenance.
