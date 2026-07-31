# Agent capabilities

The `/agent` path contains the common `Agent` facade. Create one with
`createAgent`, then call `run` for a terminal `AgentResult` or `start` for an
`AgentRun` that streams `AgentEvent` values.

<<< @/snippets/v2/agent-capabilities.ts

## Runtime extensions

Runtime implementers use `/agent/runtime` for `AgentDefinition`,
`PreparedAgentDefinition`, `AgentRunner`, `AgentRunnerProfile`,
`AgentStartRequest`, skills, and composition contracts. Ordinary applications
do not need to allocate invocation identities or prepare definitions.

## Keep lifecycle families separate

`AgentEvent` reports agent-run progress and terminal state.
`ToolExecutionEvent` reports controlled tool execution. `InteractionEvent`
reduces into deterministic interaction state. A host may correlate these
families, but one is never a substitute for another.

For a complete run sequence, see [Run an agent](/guide/agent). Runtime
implementers can continue with:

- [Bindings and composition](./bindings)
- [Agent skills](./agent-skills)
- [Retrieval and indexing](./retrieval-indexing)
- [Storage and memory](./storage-memory)
