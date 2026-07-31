# ADR-006 — State Lifetimes and Agent Runner Lifecycle

Architecture version: v2
Status: accepted
Date: 2026-07-29
Owners: architecture coordinator
Affected tasks: core-state-interventions, core-agent-runner, core-interactions
Supersedes: none

## Context

Conversation state, live pipeline continuation, runtime checkpoint, provider
session, workspace snapshot and durable execution are currently easy to
conflate.

## Decision

Define distinct:

1. `LiveContinuation` is process-local, may contain live values, has no
   portable schema, and cannot enter durable resume APIs.
2. `Snapshot` is serializable but makes no resumability or exactly-once claim.
3. `ResumableCheckpoint` is runtime-owned and carries runtime/version,
   contract/schema, code, checkpoint-format, completed-step, recorded-effect,
   creation-time, and native-reference compatibility data.
4. `DurableExecutionHandle` identifies history/timers/retries/signals owned by
   an external durable runtime; core does not claim local replayability.
5. `ProviderSessionRef` is opaque conversational continuity, not a snapshot,
   checkpoint, conversation/run ID, or durable handle.

Conversation, run, provider-session, checkpoint, and durable-job identities
remain distinct even when correlated.

- `AgentRunner` is the executable port for local, framework, subprocess,
  sidecar, and remote runtimes.
- A runner exposes capability discovery and typed preparation before execution.
- `start(AgentRunRequest)` returns an `AgentRun` with stable run/parent
  identity, canonical events, typed controls, one terminal `RunResult`, and
  optional provider-session/checkpoint/durable references.
- A run terminates exactly once as completed, failed, denied, or cancelled.
- Cancellation request, acknowledgement, and terminal cancellation are
  distinct facts.
- Approval, intervention, edit, defer, escalation, and cancellation controls
  are typed and bound to their action/intervention identity.
- Resume is runner-owned and capability-gated. It validates runtime, schema,
  code, checkpoint, and effect compatibility before execution.
- Conversation continuation, provider-session continuation, live reconnect,
  checkpoint resume, and durable-job signalling are separate capabilities.
- Child runs receive new IDs with explicit parent/causal links and invoke the
  runner port rather than the concrete local factory.
- Native handles/events/checkpoints remain opaque and never become the portable
  `AgentRun`.

The current implementation becomes `createLocalAgentRunner`; this is an
adaptation to the richer port, not a type-only rename.

## Verification implications

Type and runtime tests must prevent substitution among state lifetimes and
reject incompatible checkpoint resumes.

The local and fake-remote runners must pass the same lifecycle suite covering
discovery, preparation, start, event ordering, terminal uniqueness,
cancellation acknowledgement, typed intervention, resume compatibility, and
parent/child causality. Resume must not repeat a recorded completed effect.

## Later extension

ADR-014 classifies desktop/mobile processes and connector sessions under these
state lifetimes. Neither is a durable execution handle or portable checkpoint.
It does not supersede this decision.
