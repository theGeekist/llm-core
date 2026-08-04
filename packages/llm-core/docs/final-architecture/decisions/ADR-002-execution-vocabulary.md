# ADR-002 — Execution Vocabulary and Direct Replacements

Architecture version: v2
Status: accepted
Date: 2026-07-29
Owners: architecture coordinator
Affected tasks: all implementation tasks
Supersedes: none

## Context

Current lifecycle names overload runtime, request/response, event transport,
state and artifact semantics. Backward compatibility is not required.

## Proposed decision

Adopt:

- `AgentSpec`, `AgentRunner`, `AgentRun`, `AgentRunRequest`;
- `ModelRequest`/`ModelResponse` and
  `ProviderRequestMetadata`/`ProviderResponseMetadata`;
- `InvocationContext`, `ExecutionEvent`, `EventSink`;
- `LiveContinuation`, `Snapshot`, `ResumableCheckpoint`,
  `DurableExecutionHandle`; and
- `artifact` spelling.

Replace `construct` with capability/binding vocabulary. Qualify ambiguous
context, state, memory, task, runtime, profile, result and thread nouns.

## Consequences

This is a repository-wide breaking replacement. No aliases or deprecated names
are retained. The convergence task updates all call sites and docs together.

Backward compatibility is not an implementation constraint for this program.
Inferior contracts and names are replaced directly.

## Rejected alternatives

- Preserve old public names with aliases.
- Treat naming as a mechanical final cleanup after contracts are implemented.
