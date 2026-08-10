# Workflow intent

`llm-core` describes portable workflow intent; it does not execute a local workflow engine. Ordering, branching, reducers, interrupts, retries, checkpoints, and durable scheduling remain owned by the selected runtime.

<<< @/snippets/v2/workflow-composition.ts

A target adapter may implement an exact portable-intent operation for LangGraph, Temporal, Mastra, or another engine. That operation is distinct from the engine's native graph, history, signal, checkpoint, reducer, and retry operations. Each is classified independently as `supported`, `unsupported`, or, with exact-version source evidence, `not-applicable`.

Portable workflow intent is not a portable checkpoint. A LangGraph checkpoint, Temporal history, and another runtime's snapshot cannot be exchanged merely because their adapters produce common events.

For controlled effects, see [controlled tool execution](/orchestration/controlled-tool-execution).
