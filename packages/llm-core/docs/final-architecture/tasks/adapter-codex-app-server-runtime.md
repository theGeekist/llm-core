---
id: adapter-codex-app-server-runtime
title: Qualify the Codex app-server native conversation adapter
stage: adapters
status: done
priority: critical
forward_to: []
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
updated_at: 2026-09-04
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

Execution mode: shared-checkout
Execution rationale: The adapter owns a new isolated Codex app-server source, test and public-document surface in the canonical checkout.
Concurrency evaluation: shared lint-baseline CI repair; start alongside because its exact script and baseline paths are disjoint and excluded from this task's staging boundary.
Concurrent task scopes: external coordinator owns `scripts/quality/check-eslint-baseline.ts`, `scripts/quality/check-eslint-baseline.test.ts`, `scripts/quality/eslint-baseline.json` and any required lint configuration repair.
Swarm delegation: none.

2026-08-27: Reserved through TaskGraph beta.6 by `llm-core-codex` from
`a451771c6747484d60ab5c9f3bea795060c7ae22` in the canonical checkout. The
reservation is repository-local ignored state and does not change lifecycle
front matter.

2026-08-27: Implemented the first exact-version coordinator-owned app-server
slice against host Codex CLI `0.147.0` and the TypeScript protocol surface
generated by `codex app-server generate-ts --experimental`. New conversation,
stored-thread continuation, notification observation, active-turn steering and
explicit interruption map separately to the five ADR-018 operations. Focused
tests prove early opaque thread identity, stable continuation, distinct portable
run identity, non-cancelling steering and duplicate message rejection.

2026-08-27: Focused behaviour, package typecheck, test typecheck and lint passed.
Live process qualification, approval-request handling fixtures and the final
independent review remain outstanding. No task files were staged, committed or
pushed while the concurrent lint-baseline repair was active.

2026-08-27: Closed five actionable independent-review findings. Text inputs now
match the generated `0.147.0` `UserInput` contract including `text_elements`;
native output must cross an injected redaction projector; disconnect and
malformed-notification paths emit `agent.run.failed`; the runner truthfully
reports `controlledEffects: false`; and delta plus completed-item projections
require the exact thread and turn identity. Adversarial fixtures cover every
correction and the task-owned ESLint surface remains warning-free under the
threshold of 10. Submitted for re-review without staging, commit or push.

2026-09-04: Qualified the pinned host `codex-cli 0.147.0` through a disposable
coordinator-owned stdio client. A stored-thread run completed after native-live
`turn/steer`, `thread/resume` returned the same thread identity, and a later
turn completed successfully. A separate active run accepted steering and then
completed as `interrupted` after `turn/interrupt`. The observed native stream
included `thread/started`, `turn/started`, `item/completed`,
`item/agentMessage/delta` and `turn/completed`. An ephemeral-thread negative
probe correctly refused later `thread/resume` because no durable rollout
existed. A separate two-process probe completed a stored turn, terminated that
coordinator-owned app-server, resumed the same thread identity from a new
app-server process and completed the continued turn.

2026-09-04: Antigravity independently reviewed the task-owned implementation,
tests, public document and exact generated `0.147.0` protocol shapes. It
reported no actionable findings and approved completion after the focused
adapter suite, package and test typechecks, scoped lint and Prettier checks
passed. The coordinator repeated the adapter suite, aggregate package/schema
typechecks and package lint before the lifecycle transition.

## Blocker

None recorded.

## Handoff

### Result

Review-ready injected-client adapter and deterministic protocol fixtures for
the exact Codex `0.147.0` app-server route. Publication and a supported package
export remain outside this task.

### Decisions applied

- Kept process, transport, executable, endpoint, authentication and approval
  policy at application composition through an injected client.
- Mapped `thread/start`, `thread/resume`, `turn/start`, `turn/steer` and
  `turn/interrupt` without collapsing continuation, active input or
  cancellation.
- Exposed thread identity only as a Codex-owned opaque `ProviderSessionRef` and
  rejected continuation identity drift.
- Bound steering to the exact active turn through `expectedTurnId`, kept it
  `native-live` and rejected duplicate portable message identity before native
  ingress.
- Treated correlated native user-message notification as recipient observation
  while leaving semantic processing explicitly unobservable.
- Required native agent text to cross an injected output redaction projector
  before constructing portable output, failing closed with a terminal event.
- Reported controlled effects as unsupported until app-server approval request
  handling receives exact qualification.
- Kept the Codex Desktop embedded-process attachment route unsupported.

### Files changed

- `packages/llm-core/src/adapters/codex-app-server/{profile,protocol,public,runner}.ts`
- `packages/llm-core/tests/adapters/codex-app-server/runner.test.ts`
- `docs/adapters/codex-app-server.md`
- This task record.

### Verification evidence

- `codex --version`: `codex-cli 0.147.0`.
- `codex app-server --help`: coordinator-owned stdio, Unix-socket and WebSocket
  transport options observed; transport remains injected rather than selected
  by the adapter.
- `codex app-server generate-ts --experimental`: exact temporary protocol
  bindings generated successfully and inspected for thread, turn, steering,
  interruption and notification shapes.
- `bun test packages/llm-core/tests/adapters/codex-app-server`: 8 passed, 0
  failed, 27 assertions.
- `bun run --cwd packages/llm-core typecheck`: passed.
- `bun run --cwd packages/llm-core typecheck:tests`: passed.
- Exact ESLint over every task-owned TypeScript file: passed with zero errors
  and zero warnings after the shared threshold-tightening repair.
- Exact Prettier write/check of task-owned source, test and public document:
  passed.

### Deviations

None. The deterministic fixtures remain the replayable regression evidence and
the disposable live run qualifies the coordinator-owned host process route.

### Remaining risks

Provider acceptance alone cannot establish semantic processing. The live
qualification observed correlated native notifications but does not upgrade
native acceptance into a model-processing guarantee. The injected client and
application composition remain responsible for initialisation, authenticated
transport, server-to-client approvals or elicitations, process supervision and
restart policy. The adapter remains internal until a later publication task
grants a package export.

### Recommended next task

An unlike native-session adapter or cross-provider conformance after two
adapters qualify.
