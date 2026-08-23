---
architecture_version: 2
id: adapter-codex-app-server-runtime
title: Qualify the Codex app-server native conversation adapter
stage: adapters
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
  - native-agent-conversation-runtime-contract
decision_dependencies:
  - ADR-006
  - ADR-007
  - ADR-013
  - ADR-016
  - ADR-017
  - ADR-018
conflicts_with: []
write_scope:
  - packages/llm-core/src/adapters/codex-app-server/**
  - packages/llm-core/tests/adapters/codex-app-server/**
  - docs/adapters/codex-app-server.md
  - packages/llm-core/docs/final-architecture/tasks/adapter-codex-app-server-runtime.md
required_reading:
  - path: context/simple-chat/architecture/evidence/2026-08-18-native-agent-ingress-spike.markdown
    reason: Reconstruct the demonstrated coordinator-owned app-server route and its private Desktop-process limitation.
  - path: context/simple-chat/architecture/evidence/2026-08-19-native-agent-capability-reconciliation.markdown
    reason: Keep coordinator-owned app-server and Desktop hook profiles separate.
  - path: context/simple-chat/tests/interoperability/continuous-agent-conversation.capability-gap.markdown
    reason: Require receipts to distinguish transport, native acceptance, recipient observation and semantic processing.
read_scope:
  - context/simple-chat/architecture/evidence/2026-08-18-native-agent-ingress-spike.markdown
  - context/simple-chat/architecture/evidence/2026-08-19-native-agent-capability-reconciliation.markdown
  - context/simple-chat/tests/interoperability/continuous-agent-conversation.capability-gap.markdown
  - packages/llm-core/src/features/agent/**
  - packages/llm-core/src/features/state/**
  - packages/llm-core/src/application/interaction/**
  - packages/llm-core/src/adapters/codex-app-server/**
  - packages/llm-core/tests/adapters/codex-app-server/**
  - docs/adapters/codex-app-server.md
review_owner: coordinator
updated_at: 2026-08-23
---

# adapter-codex-app-server-runtime - Qualify the Codex app-server native conversation adapter

## Objective

Implement and qualify an exact-version Codex app-server adapter for new
conversations, idle continuation, observation, non-cancelling active input and
explicit cancellation through the ADR-018 contract.

## Why this exists

The Simple Chat spike demonstrated the complete portable operation set through
a coordinator-owned app-server. Codex Desktop displayed those tasks, but its
embedded app-server used private stdio and exposed no supported arbitrary-client
attachment route. The adapter must preserve that boundary rather than turning a
Desktop observation into a control guarantee.

The proposed private AIFSD decision
`ADR-012-native-agent-runtime-integration-composition.md` may later compose the
qualified adapter. It is provenance only until reachable.

## Inputs

- The completed native-agent conversation runtime contract and conformance
  fixtures.
- Official Codex app-server protocol documentation pinned to the qualified
  Codex release.
- Dated Simple Chat spike evidence.

## In scope

- Coordinator-owned app-server process and client lifecycle.
- `thread/start` plus `turn/start` projection to `conversation.start`.
- Stored-thread continuation plus `turn/start` projection to
  `conversation.continue`.
- Turn notifications projected to `run.observe`.
- `turn/steer` projected to `run.input.submit` with `native-live` delivery.
- Explicit cancellation projected only to `run.cancel`.
- Early thread identity projected as an opaque `ProviderSessionRef`.
- Version, operation, native-contract, process, permission and
  projection-observability qualification.

## Out of scope

- Attaching to Codex Desktop's private embedded app-server.
- Claiming Desktop visibility, shared storage or private stdio topology as a
  stable public protocol.
- Desktop UI automation, account subscription management or provider billing.
- A default runner, application coordinator, durable inbox or publication
  task.

## Contract and naming constraints

- Keep native thread and turn IDs adapter-owned and expose only opaque portable
  references and correlated projections.
- `turn/steer` is the provider mapping, not the portable operation name.
- A steering acknowledgement proves native acceptance, not model processing.
- Starting or continuing a turn while another turn is active must fail
  explicitly and must not fall back to cancellation.
- Configuration, executable path, transport choice and process policy are
  supplied at application composition.

## File ownership

Only edit the front matter, declared write scope, work log and handoff. The
brief above the work log is immutable while claimed.

## Acceptance criteria

- A pinned Codex app-server release passes the shared portable lifecycle suite.
- New and continued conversations retain stable provider-session identity while
  assigning distinct portable run identities.
- Active input enters the existing active turn, does not cancel it and produces
  causation-correlated evidence where the native stream permits it.
- Duplicate input, already-terminal input, disconnect, restart, malformed
  notification and terminal-race cases fail with explicit portable outcomes.
- The adapter makes no supported attach claim for a Desktop-owned private
  process.
- Native events and paths remain outside portable state; projected content
  crosses the registered redaction boundary.
- New or moved code follows the shallow layout and naming rules in
  `COORDINATION.md`.
- New or materially changed hand-written source/test modules target roughly 500
  lines. Modules from 501 through 600 lines record the lightweight
  `approximately 500 lines` waiver; only modules above 600 require the stronger
  coordinator waiver and named follow-up.

## Verification

```sh
bun test packages/llm-core/tests/adapters/codex-app-server
bun run --cwd packages/llm-core typecheck:tests
bun run typecheck:packages
bun run --cwd packages/llm-core lint
```

## Required evidence

- Exact Codex version and executable provenance.
- Operation and delivery-mode support report.
- App-server request, notification and failure fixtures with redacted payloads.
- Proof that active input does not cancel or replace the run.
- Explicit Desktop attachment and processing-observability limitations.
- Verification commands and results.

## Claim protocol

Follow [`../COORDINATION.md`](../COORDINATION.md) and the metadata contract in
[`../tasks/README.md`](../tasks/README.md). Do not restate those rules here.

## Work log

Pending.

## Blocker

None recorded.

## Handoff

### Result

Pending.

### Decisions applied

Pending.

### Files changed

Pending.

### Verification evidence

Pending.

### Deviations

None recorded.

### Remaining risks

Pending.

### Recommended next task

An unlike native-session adapter or cross-provider conformance after two
adapters qualify.
