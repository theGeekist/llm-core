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
`replaced_by` is an optional reference list for existing replacement tasks; a
local replacement uses its task ID and a committed cross-package replacement
uses `<package-name>/<task-id>`. `forward_to` is an optional package-qualified
reference list for planned cross-package authority that is not yet committed.
Forward targets are projected distinctly, are not replacements, and carry no
claim about target existence or lifecycle. Prose work logs are not projection
inputs. A task must not set both `replaced_by` and `forward_to`.

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
Swarm delegation: none | <parent runtime/owner> -> <child runtime/owner>: <role>; <disjoint subpath/output or review output>
```

`done` tasks retain assignment provenance and record the approved commit.
Cancelled tasks remain in place and name an existing replacement or an explicit
planned forward target when applicable. Renamed completed tasks may retain
immutable `legacy_id`, branch and checkout values.

## Brief contract

Every task defines:

- objective, scope and non-goals;
- dependencies, ADRs and conflicts;
- a non-empty ordered `required_reading` list for task-specific historical,
  caveat and evidence material;
- exact read/write authority;
- acceptance criteria and verification; and
- work log and handoff.

Each `required_reading` entry has this shape:

```yaml
required_reading:
  - path: packages/llm-core/docs/final-architecture/PLAN.md
    reason: Reconstruct the completed kernel boundary this task must preserve.
    ref: 8844ac3989e497a762fa43f23fd93e40803d2174
```

`path` is an exact existing file, never a glob, directory or URL. `reason` is a
one-line obligation explaining why the agent must open it. `ref` is optional
and, when present, is a full 40-character Git revision used only when the
historical source version matters. Every entry must be covered by `read_scope`
after configured mount aliases are resolved. A broader scope grants inspection
authority but does not generate or replace contextual reading. When relevant
evidence is found outside the declared scope, amend both fields rather than
discarding the evidence.

The governing baseline, selected task, named ADRs and dependency briefs are
supplied separately by `tasks:context` and must not be repeated merely to pad
`required_reading`. Completed and cancelled tasks retain the field for audit
and reconstruction. Historical loss wording remains provenance only and must
be paired with current correction material when it could otherwise mislead.

Task-specific text wins over summaries elsewhere. Common execution, 500-SLOC,
review, release and publication rules are not repeated here; follow
[`../COORDINATION.md`](../COORDINATION.md). Use
[`../templates/task.md`](../templates/task.md) for new briefs.
