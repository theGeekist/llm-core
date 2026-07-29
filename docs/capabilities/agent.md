# Agent capabilities

The `/agent` subpath gathers contracts used to execute and compose agents.
`AgentSpec` is portable intent. `AgentRunner` prepares a spec and starts or
resumes a run. `AgentRun` exposes canonical events, typed controls, and one
terminal `RunResult`.

<<< @/snippets/v2/agent-capabilities.ts

The same subpath curates capability bindings and the retrieval, indexing,
storage, and memory domains used by agents. These domains remain independent
ports even though one import makes composition convenient.

## Keep the lifecycle families separate

`AgentRunEvent` reports agent-run progress and terminal state.
`ExecutionEvent` reports controlled tool execution. `InteractionEvent` reduces
into deterministic interaction state. A host may correlate these families, but
one is never a substitute for another.

For a complete run sequence, see [Run an agent](/guide/agent). For the
ports commonly bound into an agent, continue with:

- [Bindings and composition](./bindings)
- [Retrieval and indexing](./retrieval-indexing)
- [Storage and memory](./storage-memory)
