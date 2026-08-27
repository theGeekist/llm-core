---
id: adapter-claude-native-session-runtime
title: Qualify Claude cross-session and Channel conversation profiles
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
  - packages/llm-core/src/adapters/claude-native-session/**
  - packages/llm-core/tests/adapters/claude-native-session/**
  - docs/adapters/claude-native-session.md
  - packages/llm-core/docs/final-architecture/tasks/adapter-claude-native-session-runtime.md
required_reading:
  - path: context/simple-chat/architecture/evidence/2026-08-18-native-agent-ingress-spike.markdown
    reason: Preserve the shared operation matrix while respecting that Claude was not re-spiked in this dated run.
  - path: context/simple-chat/architecture/evidence/2026-08-19-native-agent-capability-reconciliation.markdown
    reason: Qualify Claude cross-session sockets and research-preview Channels as separate route profiles.
  - path: context/simple-chat/tests/interoperability/continuous-agent-conversation.capability-gap.markdown
    reason: Retain the earlier Claude handoff limits and distinguish native-session processing from transport observation.
read_scope:
  - context/simple-chat/architecture/evidence/2026-08-18-native-agent-ingress-spike.markdown
  - context/simple-chat/architecture/evidence/2026-08-19-native-agent-capability-reconciliation.markdown
  - context/simple-chat/tests/interoperability/continuous-agent-conversation.capability-gap.markdown
  - packages/llm-core/src/features/agent/**
  - packages/llm-core/src/features/state/**
  - packages/llm-core/src/application/interaction/**
  - packages/llm-core/src/adapters/claude-native-session/**
  - packages/llm-core/tests/adapters/claude-native-session/**
  - docs/adapters/claude-native-session.md
review_owner: coordinator
updated_at: 2026-08-23
---

# adapter-claude-native-session-runtime - Qualify Claude cross-session and Channel conversation profiles

## Objective

Implement and qualify Claude Code cross-session messaging as the primary native
profile and Claude Channels as a separately claimed research-preview profile
against ADR-018.

## Why this exists

Claude Code 2.1.224 and later documents authenticated per-session inbox sockets,
between-tool delivery during active work and automatic new-turn delivery while
idle. Channels provide a separate pushed-event route from an opted-in MCP
server. Their availability, security, delivery and receipt semantics differ and
must not be flattened into one Claude-wide claim.

The proposed private AIFSD decision
`ADR-012-native-agent-runtime-integration-composition.md` may later compose the
qualified adapter. It is provenance only until reachable.

## Inputs

- The completed native-agent conversation runtime contract and conformance
  fixtures.
- Exact official Claude native-session and hook or control contracts applicable
  to the selected release.
- Existing Simple Chat conversation evidence, treated as historical capability
  evidence rather than current qualification.

## In scope

- Exact-version characterization of cross-session socket discovery,
  authentication, active delivery, idle new-turn delivery, inbound controls and
  non-interactive `claude -p` support.
- Separate characterization of Channel registration, pushed-event delivery,
  replies, open-session requirements and research-preview compatibility.
- Projection of supported native operations to the five ADR-018 operation IDs.
- Early native session identity as an opaque `ProviderSessionRef`.
- Native delivery timing classified from executable evidence rather than
  inferred from another provider.
- Process, permission, event, redaction, native-contract and
  projection-observability qualification.

## Out of scope

- Cross-provider message transport, coordinator election, durable inbox or
  application composition.
- Inferring active input from terminal keystrokes, cancellation or concurrent
  session invocation without native contract evidence.
- Raw Claude payloads, credentials, physical paths or live objects in portable
  state.
- Adapter publication or a default runner.

## Contract and naming constraints

- Retain Claude's native identity and lifecycle internally while exposing the
  portable operation vocabulary at the boundary.
- Declare unsupported or not-applicable operations explicitly.
- Use `not-applicable` only when the exact Claude source contract lacks the
  operation; an applicable but unimplemented operation is `unsupported`.
- Preserve native delivered, held and refused cross-session outcomes rather than
  mapping all socket acceptance to portable delivery.
- Keep cross-session and Channel route-profile identities distinct.
- Do not label delivery `native-live` or `execution-boundary` until the selected
  release demonstrates that timing.
- Input acceptance, agent observation and semantic processing remain separate
  facts.
- Configuration and locale-sensitive prose remain composition-owned.

## File ownership

Only edit the front matter, declared write scope, work log and handoff. The
brief above the work log is immutable while claimed.

## Acceptance criteria

- A pinned Claude release passes the shared lifecycle suite for every supported
  operation and fails unsupported operations explicitly.
- Cross-session active delivery occurs between tool calls without interrupting
  the active tool, while idle delivery starts a new turn.
- Socket authentication, receiver inbound policy and `claude -p` behaviour have
  executable positive and negative fixtures.
- Channel claims remain separate, name their preview status and fail closed
  when the session is not open or the Channel is not admitted.
- New and continued sessions preserve opaque provider-session identity and
  distinct portable run identity.
- Active input, when supported, leaves the current run active and reports its
  evidence-backed delivery mode.
- Duplicate input, already-terminal input, process loss, malformed output,
  cancellation and terminal-race cases have bounded portable outcomes.
- Native event ordering and extension data are preserved rather than silently
  normalised to another provider. Projection or observability limitations are
  recorded and cannot strengthen a support claim.
- New or moved code follows the shallow layout and naming rules in
  `COORDINATION.md`.
- New or materially changed hand-written source/test modules target roughly 500
  lines. Modules from 501 through 600 lines record the lightweight
  `approximately 500 lines` waiver; only modules above 600 require the stronger
  coordinator waiver and named follow-up.

## Verification

```sh
bun test packages/llm-core/tests/adapters/claude-native-session
bun run --cwd packages/llm-core typecheck:tests
bun run typecheck:packages
bun run --cwd packages/llm-core lint
```

## Required evidence

- Exact Claude version, cross-session and Channel contract revisions and
  executable provenance.
- Operation disposition and delivery-mode report.
- Redacted native-session lifecycle fixtures.
- Non-cancellation proof for active input where supported.
- Explicit observation and processing limitations.
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

Cross-provider conformance once a second unlike adapter is qualified.
