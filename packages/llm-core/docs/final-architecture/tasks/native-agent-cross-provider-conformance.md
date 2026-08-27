---
id: native-agent-cross-provider-conformance
title: Qualify native-agent conversation conformance across providers
stage: qualification
status: proposed
priority: critical
forward_to: []
depends_on:
  - adapter-codex-app-server-runtime
  - adapter-codex-desktop-hooks-runtime
  - adapter-claude-native-session-runtime
  - adapter-antigravity-cli-hooks-runtime
  - adapter-antigravity-desktop-sidecar-runtime
decision_dependencies:
  - ADR-006
  - ADR-007
  - ADR-013
  - ADR-016
  - ADR-017
  - ADR-018
conflicts_with: []
write_scope:
  - packages/llm-core/tests/conformance/native-agent-conversation/**
  - docs/adapters/native-agent-conversation.md
  - packages/llm-core/docs/final-architecture/tasks/native-agent-cross-provider-conformance.md
required_reading:
  - path: context/simple-chat/architecture/evidence/2026-08-18-native-agent-ingress-spike.markdown
    reason: Preserve the observed cross-provider operation matrix and the qualification limits of the disposable spikes.
  - path: context/simple-chat/architecture/evidence/2026-08-19-native-agent-capability-reconciliation.markdown
    reason: Exercise multiple routes per provider without collapsing their identity, timing or evidence.
  - path: context/simple-chat/tests/interoperability/continuous-agent-conversation.capability-gap.markdown
    reason: Require the shared suite to retain staged receipts, partial observability and bounded failure classifications.
read_scope:
  - context/simple-chat/architecture/evidence/2026-08-18-native-agent-ingress-spike.markdown
  - context/simple-chat/architecture/evidence/2026-08-19-native-agent-capability-reconciliation.markdown
  - context/simple-chat/tests/interoperability/continuous-agent-conversation.capability-gap.markdown
  - packages/llm-core/src/features/agent/**
  - packages/llm-core/src/features/state/**
  - packages/llm-core/src/application/interaction/**
  - packages/llm-core/src/adapters/codex-app-server/**
  - packages/llm-core/src/adapters/codex-desktop-hooks/**
  - packages/llm-core/src/adapters/claude-native-session/**
  - packages/llm-core/src/adapters/antigravity-cli-hooks/**
  - packages/llm-core/src/adapters/antigravity-desktop-sidecar/**
  - packages/llm-core/tests/adapters/codex-app-server/**
  - packages/llm-core/tests/adapters/codex-desktop-hooks/**
  - packages/llm-core/tests/adapters/claude-native-session/**
  - packages/llm-core/tests/adapters/antigravity-cli-hooks/**
  - packages/llm-core/tests/adapters/antigravity-desktop-sidecar/**
  - packages/llm-core/tests/conformance/native-agent-conversation/**
  - docs/adapters/native-agent-conversation.md
review_owner: coordinator
updated_at: 2026-08-23
---

# native-agent-cross-provider-conformance - Qualify native-agent conversation conformance across providers

## Objective

Run one portable lifecycle and active-input suite against every admitted route
profile across Codex, Claude and Antigravity, establish unlike integrations,
and publish an exact support, native-contract and observability matrix without
flattening native behaviour.

## Why this exists

One provider proves an adapter, not a portable contract. The architecture
requires unlike executable consumers before shared abstraction is qualified.
Codex app-server offers native-live input while its Desktop hooks operate at
boundaries. Antigravity CLI hooks and Desktop Sidecars require separately
qualified timing. Claude cross-session messaging and Channels have different
trust and lifecycle contracts. Their common operation vocabulary must survive
those differences without provider-wide support claims.

The resulting qualification is receiving evidence for the proposed private
AIFSD decision `ADR-012-native-agent-runtime-integration-composition.md`. It
does not itself implement or accept that decision.

## Inputs

- The completed portable native-agent conversation contract.
- Exact-version qualification evidence from every admitted route adapter.
- Existing llm-core runner conformance fixtures.
- Dated Simple Chat ingress and conversation-receipt evidence.

## In scope

- One provider-neutral suite for the five ADR-018 operations and three
  dispositions.
- Native-live and execution-boundary timing fixtures.
- New-conversation, idle-continuation, early-session, observation, active-input,
  cancellation and terminal-race scenarios.
- Second unlike integration qualification and a three-provider support matrix.
- Evidence staging for transport, native acceptance, recipient observation,
  scheduling, semantic processing and response publication where available.
- Version, permission, platform, executable-closure, native-contract and
  projection-observability facts.

## Out of scope

- Provider publication, package exports, AIFSD composition, Simple Chat
  adoption or product UI.
- Requiring identical native events, delivery latency or processing evidence.
- Inventing semantic processing receipts where a provider is unobservable.
- Cross-provider conversation transfer or conversion of one provider's session
  into another's.

## Contract and naming constraints

- Qualify shared operations, not provider commands.
- Preserve provider-native identity and event evidence beside the portable
  projection.
- A `supported` operation requires executable positive and negative fixtures.
- `unsupported` and `not-applicable` are successful explicit dispositions, not
  missing tests.
- `not-applicable` requires exact source-contract evidence that the operation is
  absent. An applicable but unimplemented operation is `unsupported`.
- Active input never means cancellation, replacement, action intervention or
  checkpoint resume.
- Configuration and provider selection remain application-composition inputs.

## File ownership

Only edit the front matter, declared write scope, work log and handoff. The
brief above the work log is immutable while claimed.

## Acceptance criteria

- At least two unlike exact-version adapters pass the same portable lifecycle
  suite, including non-cancelling active input.
- The final matrix includes Codex, Claude and Antigravity and records each
  operation disposition, delivery mode and observability limitation.
- Multiple profiles from one provider retain separate support, timing and
  evidence identities and cannot satisfy each other's qualification fixtures.
- The suite proves new start, idle continuation and checkpoint resume remain
  non-substitutable.
- Native-live and execution-boundary implementations pass the same semantic
  contract without receiving identical timing assertions.
- Duplicate input, already-terminal input, provider loss, observer loss,
  cancellation and ambiguous processing evidence have bounded classifications.
- No adapter receives a stronger portable processing claim than its native
  evidence supports.
- New or moved code follows the shallow layout and naming rules in
  `COORDINATION.md`.
- New or materially changed hand-written source/test modules target roughly 500
  lines. Modules from 501 through 600 lines record the lightweight
  `approximately 500 lines` waiver; only modules above 600 require the stronger
  coordinator waiver and named follow-up.

## Verification

```sh
bun test packages/llm-core/tests/conformance/native-agent-conversation
bun run --cwd packages/llm-core typecheck:tests
bun run typecheck:packages
bun run --cwd packages/llm-core lint
bun run --cwd packages/llm-core release:build
```

## Required evidence

- Exact provider, adapter and platform versions.
- Three-provider operation, delivery and observability matrix.
- Shared suite results and provider-specific fixture results.
- Explicit second unlike integration qualification conclusion.
- Remaining projection or observability limitations and unobservable processing
  states.
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

Adapter publication or AIFSD integration composition after receiving authority
exists.
