# ADR-002 blast-radius baseline

Date: 2026-07-29

These are pre-replacement baselines owned by later P0.x tasks. Each target is
intended to be driven to zero or to a qualified form. This file is the
blast-radius reference for ADR-002.

Run each count from the repository root, substituting the table's literal
pattern:

```sh
rg -c --no-filename -e '<pattern>' packages/llm-core/src | awk '{s+=$1} END{print s+0}'
```

| Pattern                  | ADR-002 target                             | src occurrences (2026-07-29) |
| ------------------------ | ------------------------------------------ | ---------------------------- |
| `\bconstruct`            | replace with capability/binding vocabulary | 117                          |
| `\bOutcome\b`            | execution vocabulary rename                | 67                           |
| `\bRuntime\b`            | qualify ambiguous `runtime` noun           | 55                           |
| `\bartefact`             | respell to `artifact`                      | 36                           |
| `\bMemory\b`             | qualify ambiguous `memory` noun            | 14                           |
| `\bAgentRuntime\b`       | -> AgentRunner/AgentRun vocabulary         | 6                            |
| `\bThread\b`             | qualify ambiguous `thread` noun            | 6                            |
| `\bcreateAgentRuntime\b` | -> AgentRunner factory vocabulary          | 3                            |

At baseline, `context`, `state`, `task`, `profile`, and `result` each matched 0
as capitalized whole-word identifiers in `packages/llm-core/src`. Those names
are already qualified or lowercased, so no bare forms exist for them.

## Additional high-impact legacy execution names

Requested by coordinator review (2026-07-29): extend the ledger to the remaining
high-impact legacy execution names from the accepted assessment. Same command
and scope as above.

| Pattern                  | ADR-002 / lifecycle target                                             | src occurrences (2026-07-29) |
| ------------------------ | ---------------------------------------------------------------------- | ---------------------------- |
| `\bAdapterCallContext\b` | -> `InvocationContext` / provider metadata (qualify `context`)         | 33                           |
| `\bModelCall\b`          | -> `ModelRequest`                                                      | 58                           |
| `\bModelResult\b`        | -> `ModelResponse`                                                     | 42                           |
| `\bEventStream\b`        | -> `ExecutionEvent` / `EventSink`                                      | 81                           |
| `\bTool\b`               | -> `ToolSpec`                                                          | 56                           |
| `\bToolCall\b`           | canonical `ToolCall` (footprint to confirm, not necessarily renamed)   | 49                           |
| `\bToolResult\b`         | canonical `ToolResult` (footprint to confirm, not necessarily renamed) | 44                           |
| `\bInterruptStrategy\b`  | -> `InterventionRequest` / `ResumeStrategy`                            | 18                           |

`\bTool\b` matches the bare noun only; the canonical `ToolCall`/`ToolResult`
rows are recorded so the convergence task can distinguish surviving names from
renames rather than assuming the whole `Tool*` family churns.

## Interaction pause / snapshot / resume family

These map to the ADR-002 state-lifecycle vocabulary (`LiveContinuation`,
`Snapshot`, `ResumableCheckpoint`, `DurableExecutionHandle`). The family is large
and cross-cuts interaction, workflow, recipes and adapters, so the aggregate is
recorded as a family pattern rather than one row per identifier.

```sh
rg -c --no-filename -e '\b[A-Za-z]*(Pause|Snapshot|Resume)[A-Za-z]*\b' packages/llm-core/src | awk '{s+=$1} END{print s+0}'
```

| Scope                               | Aggregate occurrences (2026-07-29) |
| ----------------------------------- | ---------------------------------- |
| `packages/llm-core/src`             | 491                                |
| `packages/llm-core/src/interaction` | 118                                |

Notable interaction-scoped identifiers (whole-word counts): `InteractionSessionPauseSnapshot`
(9), `InteractionPauseRequest` (7), `InteractionSessionResumeRequest` (5),
`InteractionPauseSnapshot` (2). Cross-cutting: `AgentLoopStateSnapshot` (13),
`PipelinePauseSnapshot` (10), `PauseSnapshot` (6), `SkillSnapshotEntry` (26). The
convergence task must decide, per identifier, whether it collapses into
`LiveContinuation`, `Snapshot`, `ResumableCheckpoint` or `DurableExecutionHandle`.
