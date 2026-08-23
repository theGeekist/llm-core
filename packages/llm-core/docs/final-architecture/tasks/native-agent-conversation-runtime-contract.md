---
architecture_version: 2
id: native-agent-conversation-runtime-contract
title: Define the portable native-agent conversation runtime contract
stage: integrations
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
  - architecture-runtime-ownership-correction
  - core-agent-runner
  - core-interactions
decision_dependencies:
  - ADR-003
  - ADR-006
  - ADR-016
  - ADR-017
  - ADR-018
conflicts_with: []
write_scope:
  - packages/llm-core/src/features/agent/**
  - packages/llm-core/src/agent/**
  - packages/llm-core/src/application/interaction/**
  - packages/llm-core/src/interaction/**
  - packages/llm-core/tests/agent/**
  - packages/llm-core/tests/application/interaction/**
  - docs/capabilities/agent.md
  - packages/llm-core/docs/final-architecture/tasks/native-agent-conversation-runtime-contract.md
required_reading:
  - path: context/simple-chat/architecture/evidence/2026-08-18-native-agent-ingress-spike.markdown
    reason: Preserve the observed distinction between native-live and execution-boundary active input without upgrading the spike into qualification.
  - path: context/simple-chat/architecture/evidence/2026-08-19-native-agent-capability-reconciliation.markdown
    reason: Model provider and route-profile identity separately across native, hook and Desktop surfaces.
  - path: context/simple-chat/tests/interoperability/continuous-agent-conversation.capability-gap.markdown
    reason: Keep transport persistence, recipient observation, runtime wake and semantic processing as separate evidence states.
read_scope:
  - context/simple-chat/architecture/evidence/2026-08-18-native-agent-ingress-spike.markdown
  - context/simple-chat/architecture/evidence/2026-08-19-native-agent-capability-reconciliation.markdown
  - context/simple-chat/tests/interoperability/continuous-agent-conversation.capability-gap.markdown
  - packages/llm-core/src/features/agent/**
  - packages/llm-core/src/features/state/**
  - packages/llm-core/src/application/interaction/**
  - packages/llm-core/src/agent/**
  - packages/llm-core/src/interaction/**
  - packages/llm-core/tests/agent/**
  - packages/llm-core/tests/application/interaction/**
  - docs/capabilities/agent.md
review_owner: coordinator
updated_at: 2026-08-23
---

# native-agent-conversation-runtime-contract - Define the portable native-agent conversation runtime contract

## Objective

Extend the integration-facing `AgentRunner` and `AgentRun` contracts with early
opaque provider-session identity and non-cancelling active conversational input,
while preserving every existing state lifetime and control meaning.

## Why this exists

Codex app-server and Antigravity CLI/hooks demonstrate that a coordinator can
submit input while native work remains active, but with unlike timing. The
current runner returns provider-session identity only with the terminal result
and exposes cancellation or action-bound intervention, neither of which means
conversation.

The proposed private AIFSD decision
`ADR-012-native-agent-runtime-integration-composition.md` is receiving
provenance for later product composition. It is not yet reachable and is not a
task dependency or required-reading item.

## Inputs

- Accepted `AgentRunner`, `AgentRun`, interaction and state-lifetime contracts.
- ADR-018's portable operation vocabulary and ownership boundary.
- Dated Simple Chat ingress evidence and its explicit qualification limits.

## In scope

- Closed operation-support declarations for `conversation.start`,
  `conversation.continue`, `run.observe`, `run.input.submit` and `run.cancel`.
- Stable provider and route-profile identity so one provider may expose several
  independently qualified implementations.
- `supported`, `unsupported` and `not-applicable` dispositions.
- `native-live` and `execution-boundary` delivery modes for supported active
  input.
- Early `ProviderSessionRef` access from a live run before terminal settlement.
- Portable active-input request, acknowledgement and processing-evidence
  contracts with stable correlation identity.
- An application-admitted, run-bound active-input authority capability whose
  issuer, scope, revision and expiry are validated before native ingress.
- Runner, interaction-session and projection changes required to accept input
  for the current run without starting a concurrent run.
- Focused conformance fixtures for native adapters.

## Out of scope

- A concrete provider adapter, default runner, scheduler, message bus, desktop
  application or AIFSD composition host.
- Provider credentials, live handles or native payloads in portable values.
- Package-root runnable facades, adapter publication and compatibility aliases.
- Durable inbox, coordinator election, retries or worker supervision.

## Contract and naming constraints

- A new conversation is `start` without `providerSession`.
- Idle continuation is `start` with `ProviderSessionRef`.
- `resume` remains checkpoint resume.
- `intervene` remains authenticated action-bound control.
- `cancel` remains explicit work cancellation.
- Active-input acceptance does not claim model observation or processing.
- Run IDs, message IDs, provider-session references, correlation values, native
  credentials and provider acceptance are not active-input authority.
- Forged, unauthorised and stale authority capabilities fail closed before an
  adapter receives the input.
- `not-applicable` requires exact source-contract evidence that an operation is
  absent. An applicable but unimplemented operation is `unsupported`.
- Preserve `MaybePromise`, strict portable JSON, closed reason codes, event
  ordering and one terminal result.
- Keep `ConversationId`, `RunId`, provider-session, checkpoint and durable-job
  identities distinct.

## File ownership

Only edit the front matter, declared write scope, work log and handoff. The
brief above the work log is immutable while claimed.

## Acceptance criteria

- Runner capabilities expose every ADR-018 operation with one exact disposition
  and require a delivery mode only for supported `run.input.submit`.
- A provider-session-capable live run exposes a validated opaque
  `ProviderSessionRef` before terminal result settlement.
- Active input returns a typed acknowledgement and cannot cancel, replace,
  restart or assign a new `RunId` to the current run.
- Forged, unauthorised and stale active-input authority is rejected before
  native ingress and cannot produce an accepted acknowledgement.
- Acceptance, recipient observation and causation-correlated processing remain
  distinguishable, including an explicit unavailable evidence outcome.
- Interaction sessions route active input to the current run while continuing
  to reject a concurrent new run.
- Existing intervention, cancellation, provider continuation and checkpoint
  resume tests retain their meanings.
- Portable values contain no physical path, credential, native SDK object or
  unredacted provider payload.
- New or moved code follows the shallow layout and naming rules in
  `COORDINATION.md`.
- New or materially changed hand-written source/test modules target roughly 500
  lines. Modules from 501 through 600 lines record the lightweight
  `approximately 500 lines` waiver; only modules above 600 require the stronger
  coordinator waiver and named follow-up.

## Verification

```sh
bun test packages/llm-core/tests/agent packages/llm-core/tests/application/interaction
bun run --cwd packages/llm-core typecheck:tests
bun run typecheck:packages
bun run --cwd packages/llm-core lint
```

## Required evidence

- Changed file list.
- Focused lifecycle and interaction test results.
- Forged, unauthorised and stale active-input authority fixture results.
- Typecheck and lint results.
- Serialized contract fixtures and schema-freshness result if the generated
  contract surface changes.
- Explicit statement of remaining processing-observability limitations.
- Proposed adapter-facing conformance fixture handoff.

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

One exact-version native provider adapter.
