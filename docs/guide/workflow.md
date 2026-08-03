# Workflow intent

`llm-core` describes portable workflow intent; it does not execute a local
workflow engine. Ordering, branching, reducers, interrupts, retries,
checkpoints, and durable scheduling remain owned by the selected runtime.

<<< @/snippets/v2/workflow-composition.ts

A target adapter may project supported intent into LangGraph, Temporal, Mastra,
or another engine. Every projection reports preserved, degraded, unsupported,
or rejected semantics.

Portable workflow intent is not a portable checkpoint. A LangGraph checkpoint,
Temporal history, and another runtime's snapshot cannot be exchanged merely
because their adapters produce common events.

For controlled effects, see
[controlled tool execution](/orchestration/controlled-tool-execution).
