# LangGraph runtime adapter

The LangGraph runtime adapter qualifies `@langchain/langgraph` `1.0.7` as an internal `AgentRunner` candidate. It remains internal until a separate publication task adds a supported package export.

Applications supply an already compiled graph and the identity source. The adapter does not construct graph topology, choose persistence, read host configuration or fall back to the local runner. Agent definitions are limited to read-only effects because the assessed boundary does not project LangGraph effects through llm-core approval and receipt controls.

## Operation matrix

| Operation | Disposition | Boundary |
| --- | --- | --- |
| Graph start | `supported` | Portable input starts the injected compiled graph. |
| Graph observation | `supported` | llm-core exposes a closed summary of selected LangGraph-owned thread, checkpoint, pending-node and interrupt facts. |
| Graph cancellation | `supported` | The adapter supplies an `AbortSignal`; cancellation is cooperative. |
| Native checkpoint, reducer and thread | `supported` | Exact fixtures exercise these as LangGraph-owned operations; the portable run ID supplies `thread_id`. |
| Native interrupt and resume | `supported` | Applications resume through LangGraph's `Command` contract. |
| Adapter state summary | `supported` | llm-core projects checkpoint identity, pending nodes and interrupt count when a checkpointer is available. |
| Adapter error summary | `supported` | llm-core keeps abort, invocation rejection and unavailable state distinct without exposing native exceptions. |
| Raw native state and errors | `unsupported` | Native values, task identity, metadata, checkpoint relationships and exception objects do not cross the adapter boundary. |
| Native event stream | `unsupported` | The assessed adapter does not expose LangGraph's native event stream. |
| Portable checkpoint resume | `unsupported` | No LangGraph checkpoint is projected as a portable checkpoint. |
| Portable intervention | `unsupported` | `AgentRun.intervene` fails explicitly. |

## Portable projection

The adapter emits one started event and one terminal event with stable portable run identity. A normally completed graph must return an output accepted by the closed `AgentOutput` contract. Native interruption produces the explicit portable failure reason `langgraph-interrupted`; callers inspect the separate native observation for pending nodes, interrupt count and opaque checkpoint identity.

Started events are observable before graph settlement. Cancellation emits separate requested and acknowledged events before aborting the signal passed to the active graph invocation. A native node must observe that signal for work already executing to stop promptly. Runs that ignore it remain cooperative rather than forcefully terminated.

## Exact qualification

The isolated `apps/langgraph-runtime-qualification` workspace pins `@langchain/langgraph` `1.0.7`. Its fixtures execute real `StateGraph`, `MemorySaver`, reducer, independent-thread, interrupt, `Command` resume and active-node cancellation paths. The adapter rejects any source contract other than `npm:@langchain/langgraph@1.0.7`.

Graphs without a checkpointer can complete normally. Their native observation reports state as unavailable rather than turning successful execution into failure. Native graph state is never presented as portable workflow state, and successful qualification does not claim checkpoint interchangeability with another runtime.
