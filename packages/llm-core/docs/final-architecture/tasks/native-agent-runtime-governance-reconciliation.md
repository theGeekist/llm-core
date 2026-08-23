---
architecture_version: 2
id: native-agent-runtime-governance-reconciliation
title: Reconcile native-agent runtime authority and future task admission
stage: architecture
status: done
priority: critical
replaced_by: []
forward_to: []
preferred_owner_kind: codex
owner: codex-adr018-governance
owner_kind: codex
lease_started_at: 2026-08-24T01:36:49+08:00
lease_expires_at: 2026-08-24T09:42:50+08:00
base_sha: e9399df47cb2f9018f7aa8c74f5592972c63b3d5
branch: main
worktree: /Users/jasonnathan/Repos/@theGeekist/llm-core
depends_on: []
decision_dependencies: []
conflicts_with: []
write_scope:
  - packages/llm-core/docs/final-architecture/decisions/ADR-018-native-agent-conversation-runtime.md
  - packages/llm-core/docs/final-architecture/decisions/README.md
  - packages/llm-core/docs/final-architecture/tasks/native-agent-conversation-runtime-contract.md
  - packages/llm-core/docs/final-architecture/tasks/adapter-codex-app-server-runtime.md
  - packages/llm-core/docs/final-architecture/tasks/adapter-codex-desktop-hooks-runtime.md
  - packages/llm-core/docs/final-architecture/tasks/adapter-claude-native-session-runtime.md
  - packages/llm-core/docs/final-architecture/tasks/adapter-antigravity-cli-hooks-runtime.md
  - packages/llm-core/docs/final-architecture/tasks/adapter-antigravity-desktop-sidecar-runtime.md
  - packages/llm-core/docs/final-architecture/tasks/native-agent-cross-provider-conformance.md
  - packages/llm-core/docs/final-architecture/tasks/task-graph-native-agent-runtime-migration-qualification.md
  - packages/llm-core/docs/final-architecture/tasks/native-agent-runtime-governance-reconciliation.md
  - packages/llm-core/docs/final-architecture/STATUS.md
required_reading:
  - path: packages/llm-core/docs/final-architecture/decisions/ADR-017-external-contract-fidelity.md
    reason: Preserve exact native-contract support and the accepted unsupported and not-applicable semantics.
  - path: context/simple-chat/architecture/evidence/2026-08-18-native-agent-ingress-spike.markdown
    reason: Preserve the spike's explicit authentication, authorisation and single-writer limitations when assigning active-input authority.
read_scope:
  - packages/llm-core/docs/final-architecture/decisions/ADR-017-external-contract-fidelity.md
  - packages/llm-core/docs/final-architecture/decisions/**
  - packages/llm-core/docs/final-architecture/tasks/**
  - packages/llm-core/docs/final-architecture/STATUS.md
  - packages/llm-core/docs/final-architecture/COORDINATION.md
  - context/simple-chat/architecture/evidence/2026-08-18-native-agent-ingress-spike.markdown
review_owner: coordinator
updated_at: 2026-08-24
---

# native-agent-runtime-governance-reconciliation — Reconcile native-agent runtime authority and future task admission

## Objective

Revise and accept ADR-018 as a fail-closed native-agent runtime authority decision while keeping every downstream implementation task proposed and accurately bounded by reachable evidence.

## Why this exists

The proposed ADR and eight future briefs currently block the architecture projection. Independent review found that loss-based support wording conflicts with accepted ADR-017, active-input admission authority is unspecified, and the Task Graph migration brief claims inputs it cannot yet inspect.

## Inputs

- The proposed ADR-018 and its eight proposed downstream task briefs.
- Accepted ADR-017 exact-operation support semantics.
- The Simple Chat ingress spike's explicit authority limitations.
- Independent review findings recorded in the production-quality-gates work log.

## In scope

- Replace information-loss authority language with native-contract preservation and explicit projection or observability limitations.
- Assign a fail-closed application admission boundary for active input and require forged, unauthorised and stale-authority negative fixtures.
- Preserve exact `unsupported` and `not-applicable` semantics from ADR-017.
- Remove unreachable AIFSD material from the Task Graph migration task's current inputs.
- Record that exact Task Graph source authority, mounted paths and a full revision ref are prerequisites before that proposed task can be admitted.
- Correct task metadata dates, accept ADR-018 only after review corrections, keep all eight implementation tasks proposed, and regenerate STATUS.

## Out of scope

- Implementing any native-agent adapter, portable runtime contract or Task Graph migration.
- Creating a Task Graph mount before a committed reference is available.
- Treating provider acceptance, message identity or correlation as authorisation.

## Contract and naming constraints

- Projection or observability limitations may weaken or reject a support claim; they never legitimise loss of an applicable native contract.
- `not-applicable` means the recognised source contract lacks the operation. An applicable but unimplemented operation is `unsupported`.
- Active input requires an application-admitted authority capability. Run IDs, message IDs and provider acceptance are not authority.

## File ownership

Only edit the front matter, declared write scope, work log and handoff. The brief above the work log is immutable while claimed.

## Acceptance criteria

- ADR-018 contains no normative information-loss support language and is consistent with ADR-017.
- Active-input admission is fail-closed and future contract fixtures include forged, unauthorised and stale-authority cases.
- The Task Graph migration task names no unreachable AIFSD input and cannot be admitted before exact mounted source and revision authority exist.
- All eight downstream tasks remain `proposed`, unowned and unleased.
- Architecture status and documentation gates are green after deterministic STATUS regeneration.

## Verification

```sh
bun run --cwd packages/llm-core write:architecture-status
bun run --cwd packages/llm-core check:architecture-status
bun run docs:check
bun run tasks:plan --authority all
git diff --check
```

## Required evidence

- Changed file list and exact downstream lifecycle states.
- Independent review of the revised ADR and task set.
- Verification commands, exit statuses and concise results.
- Remaining external Task Graph source and mount prerequisite.

## Claim protocol

Follow [`../COORDINATION.md`](../COORDINATION.md) and the metadata contract in [`../tasks/README.md`](../tasks/README.md). Do not restate those rules here.

## Work log

Execution mode: shared-checkout
Execution rationale: The uncommitted ADR and future-task proposal set already exists only in the canonical checkout and must be corrected without detaching it from the quality gate that exposed the mismatch.
Concurrency evaluation: production-quality-gates; start alongside because that task relinquished STATUS and owns no ADR-018 or native-agent future-task path.
Concurrent task scopes: production-quality-gates owns repository quality configuration, scripts, workflows, package metadata and its own task brief; this task exclusively adopts the existing ADR-018 proposal set, its eight future briefs, decision index and STATUS projection.
Swarm delegation: codex/root -> codex/adr018_decision_review: governance implementation and focused verification; task-owned ADR, task briefs and review output.

2026-08-23: The coordinator inspected the dirty checkout and active task plan. No
active task owns the proposal files. This lease explicitly adopts the existing
uncommitted proposal material after independent review identified the bounded
corrections; it does not claim unrelated AIFSD, headless-workbench or quality
implementation paths.

2026-08-23: Revised ADR-018 to preserve ADR-017 exact native-contract support,
assigned fail-closed application admission authority for active input, and
accepted the corrected decision. Kept all eight downstream tasks proposed,
unowned and unleased. Removed unreachable AIFSD input from the Task Graph
migration brief and made its exact committed source, configured mount, exact
paths and full revision ref prerequisites to readiness. Regenerated STATUS and
ran the focused governance gates successfully.

2026-08-23: Independent semantic review confirmed the corrected ADR preserves
ADR-017, active input is fail-closed and authority-bound, all eight downstream
tasks remain proposed, and the migration prerequisite is exact. Review findings
on STATUS source ordering, active-task evidence fields and dates were corrected.
This task is ready for coordinated reception with `production-quality-gates` so
both task sources exist in the same reproducible STATUS projection.

## Blocker

None for the governance correction. The downstream Task Graph migration task remains proposed until its exact committed source can be mounted and revision-bound.

## Handoff

### Result

Independently reviewed governance correction, ready for coordinated commit.
ADR-018 is accepted; no native-agent contract, adapter or migration
implementation is admitted or performed.

### Decisions applied

- ADR-017 exact native-contract support and exact `unsupported` and
  `not-applicable` meanings.
- ADR-018 fail-closed native-agent conversation runtime authority, as corrected
  by this task.

### Files changed

- `packages/llm-core/docs/final-architecture/decisions/ADR-018-native-agent-conversation-runtime.md`
- `packages/llm-core/docs/final-architecture/decisions/README.md`
- `packages/llm-core/docs/final-architecture/tasks/native-agent-conversation-runtime-contract.md`
- `packages/llm-core/docs/final-architecture/tasks/adapter-codex-app-server-runtime.md`
- `packages/llm-core/docs/final-architecture/tasks/adapter-codex-desktop-hooks-runtime.md`
- `packages/llm-core/docs/final-architecture/tasks/adapter-claude-native-session-runtime.md`
- `packages/llm-core/docs/final-architecture/tasks/adapter-antigravity-cli-hooks-runtime.md`
- `packages/llm-core/docs/final-architecture/tasks/adapter-antigravity-desktop-sidecar-runtime.md`
- `packages/llm-core/docs/final-architecture/tasks/native-agent-cross-provider-conformance.md`
- `packages/llm-core/docs/final-architecture/tasks/task-graph-native-agent-runtime-migration-qualification.md`
- `packages/llm-core/docs/final-architecture/tasks/native-agent-runtime-governance-reconciliation.md`
- `packages/llm-core/docs/final-architecture/STATUS.md`

### Verification evidence

- `bun run --cwd packages/llm-core write:architecture-status`: rendered STATUS
  from 94 task briefs.
- `bun run --cwd packages/llm-core check:architecture-status`: verified STATUS
  against 94 task briefs.
- `bun run docs:check`: verified 43 published pages, 167 package engineering
  pages, 6 routing pages, 23 embedded snippets, all sidebar links and snippet
  typechecking.
- `bun run tasks:plan --authority all`: parsed successfully; this governance task
  and `production-quality-gates` are the only active llm-core tasks, while the
  native-agent contract remains a blocked proposed candidate during this lease.
- `git diff --check`: passed.
- Downstream lifecycle audit: all eight implementation tasks remain `proposed`
  with null owner, owner kind, lease, base SHA, branch and worktree values.
- Independent final review found no actionable findings and confirmed the
  active-input, cancellation, persistence, delivery and semantic-processing
  distinctions remain intact.

### Deviations

None.

### Remaining risks

The Task Graph migration task cannot become ready until the provisional source
is committed, exposed through a configured `context/task-graph` mount, and its
exact source, schema and fixture paths are revision-bound with a full
40-character `ref`.

### Recommended next task

Receive this governance diff with `production-quality-gates`, regenerate STATUS
from the committed task set, then perform coordinator-owned lifecycle closure.
Do not claim any downstream native-agent implementation task as part of this
governance change.
