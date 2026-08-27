---
id: adapter-antigravity-cli-hooks-runtime
title: Qualify the Antigravity CLI and hooks conversation adapter
stage: adapters
status: proposed
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
  - packages/llm-core/src/adapters/antigravity-cli-hooks/**
  - packages/llm-core/tests/adapters/antigravity-cli-hooks/**
  - docs/adapters/antigravity-cli-hooks.md
  - packages/llm-core/docs/final-architecture/tasks/adapter-antigravity-cli-hooks-runtime.md
required_reading:
  - path: context/simple-chat/architecture/evidence/2026-08-18-native-agent-ingress-spike.markdown
    reason: Reconstruct the successful hook-backed execution-boundary route and the concurrent-headless cancellation failure.
  - path: context/simple-chat/architecture/evidence/2026-08-19-native-agent-capability-reconciliation.markdown
    reason: Keep the proven CLI hook profile separate from the Desktop Sidecar profile.
  - path: context/simple-chat/tests/interoperability/continuous-agent-conversation.capability-gap.markdown
    reason: Prevent the hook inbox from claiming durable delivery, runtime wake or semantic processing without separate receipts.
read_scope:
  - context/simple-chat/architecture/evidence/2026-08-18-native-agent-ingress-spike.markdown
  - context/simple-chat/architecture/evidence/2026-08-19-native-agent-capability-reconciliation.markdown
  - context/simple-chat/tests/interoperability/continuous-agent-conversation.capability-gap.markdown
  - packages/llm-core/src/features/agent/**
  - packages/llm-core/src/features/state/**
  - packages/llm-core/src/application/interaction/**
  - packages/llm-core/src/adapters/antigravity-cli-hooks/**
  - packages/llm-core/tests/adapters/antigravity-cli-hooks/**
  - docs/adapters/antigravity-cli-hooks.md
review_owner: coordinator
updated_at: 2026-08-23
---

# adapter-antigravity-cli-hooks-runtime - Qualify the Antigravity CLI and hooks conversation adapter

## Objective

Implement and qualify an exact-version Antigravity adapter that uses headless
CLI conversation lifecycle for new and idle runs and hook-backed inbox delivery
for non-cancelling active input.

## Why this exists

The Simple Chat spike showed that Antigravity supports active conversation, but
at provider execution boundaries rather than through a native live-message API.
A concurrent headless continuation cancelled or displaced active work, while a
hook-injected `userMessage` let the current command finish and continued the
same conversation. That distinction is a first-class contract fact.

The proposed private AIFSD decision
`ADR-012-native-agent-runtime-integration-composition.md` may later compose the
qualified adapter. It is provenance only until reachable.

## Inputs

- The completed native-agent conversation runtime contract and conformance
  fixtures.
- Exact Antigravity CLI, headless and hooks documentation for the selected
  release.
- Dated Simple Chat hook-backed ingress evidence.

## In scope

- `agy -p` projection to `conversation.start`.
- `agy -p --conversation <id>` projection to idle
  `conversation.continue` only.
- Stream JSON and hook lifecycle projected to `run.observe`.
- A correlated, host-owned hook inbox projected to `run.input.submit` with
  `execution-boundary` delivery.
- Hook output validation, continuation control and duplicate delivery fencing.
- Explicit cancellation projected only to `run.cancel`.
- Early Antigravity conversation identity projected as `ProviderSessionRef`.
- Exact-version CLI, hook, process, permission, native-contract and
  projection-observability qualification.

## Out of scope

- Concurrent headless continuation as active input.
- `/btw` as primary-run steering.
- Claiming stream JSON as an input protocol or hook acceptance as mid-command
  pre-emption.
- Treating a local inbox as a durable mailbox, scheduler or coordinator.
- Adapter publication, provider credentials or a default runner.

## Contract and naming constraints

- The hook inbox is host-owned and addressable by opaque portable correlation,
  but physical paths and native hook payloads remain adapter-owned.
- Input may be accepted while a command is active; `execution-boundary` means
  the agent receives it only at the next eligible hook boundary.
- Hook delivery must not set or imply cancellation.
- Provider acceptance, hook injection, agent observation and semantic processing
  require distinct evidence states.
- Configuration supplies executable location, hook registration, inbox store,
  time bounds and process policy at composition.

## File ownership

Only edit the front matter, declared write scope, work log and handoff. The
brief above the work log is immutable while claimed.

## Acceptance criteria

- A pinned Antigravity release passes the shared lifecycle suite with
  `execution-boundary` active input.
- The original active command completes normally when correlated input arrives,
  and the same run processes that input at a later eligible boundary.
- Concurrent headless continuation and `/btw` are executable negative fixtures,
  not undocumented fallbacks.
- Duplicate, stale, already-terminal, hook-error, watcher-loss, process-loss and
  terminal-race cases produce bounded portable outcomes.
- New and idle continuation retain provider-session identity while portable
  runs remain distinct.
- The adapter records when recipient observation or semantic processing cannot
  be proven.
- New or moved code follows the shallow layout and naming rules in
  `COORDINATION.md`.
- New or materially changed hand-written source/test modules target roughly 500
  lines. Modules from 501 through 600 lines record the lightweight
  `approximately 500 lines` waiver; only modules above 600 require the stronger
  coordinator waiver and named follow-up.

## Verification

```sh
bun test packages/llm-core/tests/adapters/antigravity-cli-hooks
bun run --cwd packages/llm-core typecheck:tests
bun run typecheck:packages
bun run --cwd packages/llm-core lint
```

## Required evidence

- Exact Antigravity CLI version and official contract references.
- Operation and `execution-boundary` support report.
- Redacted hook, stream and process fixtures.
- Non-cancellation proof and concurrent-headless negative proof.
- Inbox delivery, hook injection and processing receipt limitations.
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

Cross-provider conformance after at least two unlike adapters qualify.
