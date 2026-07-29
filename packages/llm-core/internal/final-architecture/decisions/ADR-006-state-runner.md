# ADR-006 — State Lifetimes and Agent Runner Lifecycle

Status: proposed
Date: 2026-07-29
Owners: architecture coordinator
Affected tasks: P0-130, P0-140, P0-170
Supersedes: none

## Context

Conversation state, live pipeline continuation, runtime checkpoint, provider
session, workspace snapshot and durable execution are currently easy to
conflate.

## Proposed decision

Define distinct:

1. `LiveContinuation` — process-local and non-serializable.
2. `Snapshot` — serializable capture with no resume promise.
3. `ResumableCheckpoint` — runtime-owned continuation with compatibility.
4. `DurableExecutionHandle` — externally owned durable history/job.
5. `ProviderSessionRef` — opaque provider conversational continuation.

Define `AgentRunner` as the executable port and `AgentRun` as one lifecycle
instance. Rename the present implementation `createLocalAgentRunner`.

## Verification implications

Type and runtime tests must prevent substitution among state lifetimes and
reject incompatible checkpoint resumes.
