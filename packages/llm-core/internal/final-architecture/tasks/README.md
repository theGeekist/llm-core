# Architecture v2 task briefs

Each file here is the authoritative record for one bounded task, including its
exact dependencies. Programme grouping and admission live in
[`../ROADMAP.md`](../ROADMAP.md); execution procedure lives in
[`../COORDINATION.md`](../COORDINATION.md); completed kernel history lives in
[`../PLAN.md`](../PLAN.md).

## Lifecycle and vocabulary

```text
proposed -> ready -> claimed -> in_progress -> review -> done
                         \-> blocked
proposed | ready | blocked -> cancelled
```

Use only these values:

- `stage`: `architecture`, `baseline`, `core`, `capabilities`, `language`,
  `specifications`, `qualification`, `integrations`, `adapters`, `applications`;
- `status`: `proposed`, `ready`, `claimed`, `in_progress`, `review`, `blocked`,
  `done`, `cancelled`;
- `priority`: `critical`, `high`, `medium`, `normal`;
- owner kinds: `coordinator`, `codex`, `claude-code`.

Empty YAML values and `null` are equivalent only for unassigned metadata.
`proposed`, `ready` and never-started `cancelled` tasks have no assignment.
`claimed`, `in_progress`, `review` and actively leased `blocked` tasks require
owner, owner kind, lease start/expiry, base SHA, branch and `worktree`. The
historical field name `worktree` records the selected checkout path, including
the shared primary checkout.

`evidence_milestone` is optional structured STATUS evidence for completed work.
`replaced_by` is an optional task-ID list required for superseded cancelled
work; prose work logs are not projection inputs.

The coordinator owns lifecycle changes and updates task front matter plus
`STATUS.md` together. Workers request transitions. A committed governance set
must contain every task-frontmatter source needed for the exact STATUS
projection; do not place a partial set in an implementation commit.

## Active work log

Use these exact labels:

```text
Execution mode: shared-checkout | dedicated-worktree
Execution rationale: <non-empty explanation>
Concurrency evaluation: <ongoing task IDs or none; start alongside | wait | no concurrency; boundary rationale>
Concurrent task scopes: none | <task IDs and disjoint scopes>
Swarm delegation: none | <child owner and disjoint subpath/output>
```

`done` tasks retain assignment provenance and record the approved commit.
Cancelled tasks remain in place and name their replacements. Renamed completed
tasks may retain immutable `legacy_id`, branch and checkout values.

## Brief contract

Every task defines:

- objective, scope and non-goals;
- dependencies, ADRs and conflicts;
- exact read/write authority;
- acceptance criteria and verification; and
- work log and handoff.

Task-specific text wins over summaries elsewhere. Common execution, 500-SLOC,
review, release and publication rules are not repeated here; follow
[`../COORDINATION.md`](../COORDINATION.md). Use
[`../templates/task.md`](../templates/task.md) for new briefs.
