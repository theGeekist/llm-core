---
architecture_version: 2
id: task-graph-native-agent-runtime-migration-qualification
title: Qualify migration from the Task Graph native-agent reference
stage: qualification
status: proposed
priority: critical
replaced_by: []
forward_to: []
preferred_owner_kind: codex
owner: null
owner_kind: null
lease_started_at: null
lease_expires_at: null
base_sha: null
branch: null
worktree: null
depends_on:
  - native-agent-cross-provider-conformance
decision_dependencies:
  - ADR-006
  - ADR-007
  - ADR-013
  - ADR-016
  - ADR-017
  - ADR-018
conflicts_with: []
write_scope:
  - packages/llm-core/src/features/agent/**
  - packages/llm-core/src/agent/**
  - packages/llm-core/src/application/interaction/**
  - packages/llm-core/src/adapters/codex-app-server/**
  - packages/llm-core/src/adapters/codex-desktop-hooks/**
  - packages/llm-core/src/adapters/claude-native-session/**
  - packages/llm-core/src/adapters/antigravity-cli-hooks/**
  - packages/llm-core/src/adapters/antigravity-desktop-sidecar/**
  - packages/llm-core/tests/conformance/native-agent-conversation/**
  - docs/adapters/native-agent-conversation.md
  - packages/llm-core/docs/final-architecture/tasks/task-graph-native-agent-runtime-migration-qualification.md
required_reading:
  - path: context/simple-chat/architecture/evidence/2026-08-19-native-agent-capability-reconciliation.markdown
    reason: Preserve the complete provider-route inventory and the distinction between documented capability and executable adapter conformance.
  - path: context/simple-chat/architecture/evidence/2026-08-18-native-agent-ingress-spike.markdown
    reason: Retain the executable Codex and Antigravity evidence against which the migrated adapters must be compared.
read_scope:
  - context/simple-chat/architecture/evidence/2026-08-18-native-agent-ingress-spike.markdown
  - context/simple-chat/architecture/evidence/2026-08-19-native-agent-capability-reconciliation.markdown
  - packages/llm-core/src/features/agent/**
  - packages/llm-core/src/agent/**
  - packages/llm-core/src/application/interaction/**
  - packages/llm-core/src/adapters/codex-app-server/**
  - packages/llm-core/src/adapters/codex-desktop-hooks/**
  - packages/llm-core/src/adapters/claude-native-session/**
  - packages/llm-core/src/adapters/antigravity-cli-hooks/**
  - packages/llm-core/src/adapters/antigravity-desktop-sidecar/**
  - packages/llm-core/tests/conformance/native-agent-conversation/**
  - docs/adapters/native-agent-conversation.md
review_owner: coordinator
updated_at: 2026-08-23
---

# task-graph-native-agent-runtime-migration-qualification - Qualify migration from the Task Graph native-agent reference

## Objective

Prove that the llm-core native-agent runtime and provider adapters preserve the
behaviour and evidence of the provisional Task Graph implementation before any
provisional provider code is retired.

## Why this exists

Task Graph contains the first executable reference while llm-core and
`@aifsd/sdk` are not yet reachable by a consumer. Permanent ownership belongs
here, but migration without fixture, source and revision provenance would
create a second implementation and conceal native-contract or timing drift.

## Inputs

- The completed llm-core native-agent contract and provider adapters.
- The exact committed Task Graph source revision, schemas and fixtures governed
  by Task Graph ADR-006.
- The cross-provider conformance result.

## In scope

- Source-to-contract mapping for every provisional Task Graph provider route.
- Reuse or faithful migration of provider fixtures with provenance.
- Behavioural comparison of operations, delivery timing and receipts.
- An explicit native-contract preservation and semantic-difference report.
- Evidence that Task Graph can consume the llm-core runtime projection without
  importing provider-specific semantics into its empirical ledger.

## Out of scope

- Removing Task Graph's provisional code before AIFSD and consumer dogfood.
- Moving Task Graph annotations, empirical ledger or Current Velocity here.
- Adding Task Graph as a runtime dependency of llm-core.
- Reimplementing a route when the incumbent code can be migrated coherently.

## Contract and naming constraints

- llm-core owns provider-neutral operations, profiles, runtime events and
  delivery receipts.
- Native provider code remains behind explicit adapter fronts.
- Task Graph task, attempt, role, phase and ledger concepts do not enter the
  portable runtime contract.
- Migration provenance identifies original repository, revision, file and
  fixture identity.
- A matching test result is not sufficient when the native contract or delivery
  timing changed.
- Projection or observability limitations may weaken or reject a support claim;
  they cannot justify narrowed support.

## File ownership

Only edit the front matter, declared write scope, work log and handoff. The
brief above the work log is immutable while claimed.

## Acceptance criteria

- The migration evidence names one exact committed Task Graph revision and
  maps every adopted source and fixture to its origin.
- Every provisional provider route has one explicit result: migrated, replaced
  by a stronger qualified implementation, or intentionally unsupported.
- The Task Graph fixtures pass against the llm-core adapters or the affected
  portable operation is explicitly unsupported with a reviewed semantic
  difference. A difference report cannot turn narrowed behaviour into support.
- Provider route identities and delivery receipts are exposed through llm-core
  public fronts without Task Graph domain fields.
- A provider-neutral runtime-evidence projection is sufficient for Task Graph
  task/run correlation.
- The result identifies the exact AIFSD qualification needed before provisional
  Task Graph removal.
- New or moved code follows the shallow layout and naming rules in
  `COORDINATION.md`.
- New or materially changed hand-written source/test modules target roughly 500
  lines. Modules from 501 through 600 lines record the lightweight
  `approximately 500 lines` waiver; only modules above 600 require the stronger
  coordinator waiver and named follow-up.

## Verification

```sh
bun run typecheck:packages
bun test packages/llm-core/tests/conformance/native-agent-conversation
bun run docs:check
```

## Required evidence

- Exact originating Task Graph commit, paths, schemas and fixture identities.
- Source-to-contract and route-to-adapter mapping.
- Verification commands, exit statuses and concise results.
- Native-contract preservation and semantic-difference report.
- AIFSD and Task Graph follow-up references.

## Claim protocol

Follow [`../COORDINATION.md`](../COORDINATION.md) and the metadata contract in
[`../tasks/README.md`](../tasks/README.md). Do not restate those rules here.

## Work log

## Blocker

Do not transition this task to `ready` or claim it until the Task Graph reference
is committed, exposed through a configured `context/task-graph` mount, and its
exact source, schema and fixture paths are added to `required_reading` and
`read_scope` with a full 40-character revision `ref`. The native-agent
cross-provider conformance task must also be complete.

## Handoff

### Result

### Decisions applied

### Files changed

### Verification evidence

### Deviations

### Remaining risks

### Recommended next task
