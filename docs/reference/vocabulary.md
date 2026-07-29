# Vocabulary

`llm-core` uses a small, deliberate set of names. Each one means one thing, and
the docs use it consistently. If you are coming from 1.x, the
migration guide will map the old names to these as the renames settle.

The rule behind the list: a portable value is JSON-compatible and safe to store
or send, while a live value holds a handle to something running now. The two
never wear the same name.

## Agents

| Term | What it is |
| :--- | :--- |
| `AgentSpec` | The description of a probabilistic agent as data: its model, tools, and policy. You author this. Distinct from a `Recipe`. |
| `AgentRunner` | The port that executes an `AgentSpec`. The local implementation is `createLocalAgentRunner`. |
| `AgentRun` | The live handle for one execution: it exposes the `ExecutionEvent` stream and typed controls while it runs. |
| `RunResult` | The one terminal result an `AgentRun` ends in: `completed`, `failed`, `denied`, or `cancelled`. A pause is not one of these; it is a control. |

## Orchestration

Explicit, author-defined execution. Kept distinct from the probabilistic agent loop.

| Term | What it is |
| :--- | :--- |
| `Workflow` | Explicit application orchestration: a graph of steps you author and can reason about step by step. |
| `Step` | An author-defined unit of work in a `Workflow`. (A runtime-scheduled unit is a `Task`, qualified.) |
| `Recipe` | A reusable, preconfigured `Workflow` composition you can name and share. It is not an `AgentSpec` and not a bare template. |
| `Outcome<T>` | How a workflow reports its conclusion: the union `ok \| paused \| error`. Distinct from `RunResult`. |

## Model

| Term | What it is |
| :--- | :--- |
| `ModelRef` | Logical selection intent: the handle a spec names (for example "default"), resolved to a concrete binding. Never a provider, deployment, credential, endpoint, or executable object. |
| `ModelRequest` | A portable, provider-neutral request to a model. |
| `ModelResponse` | The portable response. Provider-native data is redacted and preserved only under provider metadata or namespaced extensions; native values never enter portable fields. |
| `ModelProfile` | An immutable, versioned description of one provider/model/deployment combination: its capabilities, quirks, and conformance evidence. |

## Tools

| Term | What it is |
| :--- | :--- |
| `ToolSpec` | The declared shape of a tool: its name, input schema, and whether it has effects. |
| `ToolCall` | A request to run a tool with specific arguments. |
| `ToolResult` | The value a tool returns. |
| `ToolExecutionReceipt` | The durable lifecycle record of a side-effecting tool, from reservation onward: the policy and approval decisions, execution, reconciliation, and any compensation. |

## Control

| Term | What it is |
| :--- | :--- |
| `PolicyDecision` | The verdict on whether a call may proceed, and under what conditions. |
| `ApprovalRequest` | A request for an authenticated human or system to approve an effect. |
| `InterventionRequest` | A structured pause that hands control back to you mid-run. |
| `ResumeStrategy` | How a paused run continues once the intervention is answered. |

## Evidence

| Term | What it is |
| :--- | :--- |
| `ExecutionEvent` | The canonical, redacted record of one thing that happened in a run. These form the canonical execution history; they can be projected into traces, UI streams, and observability systems, but are not themselves a trace. |
| `EventSink` | A best-effort projection port for emitting events to a UI or provider stream. It is not authoritative storage; the receipt journal or another evidence store owns durable records. |

## State and durability

These four are separate on purpose. You pick the one whose guarantee you need.

| Term | What it is |
| :--- | :--- |
| `LiveContinuation` | A process-local handle to a run still executing here. It may hold live values, has no portable schema, and cannot enter durable resume APIs. |
| `Snapshot` | A serializable, point-in-time capture of run state. It makes no resumability or exactly-once claim. |
| `ResumableCheckpoint` | A portable, runtime-owned checkpoint carrying runtime/version, schema, code, checkpoint-format, completed-step, recorded-effect, and native-reference compatibility data. Resume is runner-owned and capability-gated: a compatible runtime validates that data before continuing. |
| `DurableExecutionHandle` | A reference to a run whose history, timers, retries, and signals are owned by an external durable runtime. Core claims no local replayability. |

## Invocation and results

| Term | What it is |
| :--- | :--- |
| `InvocationContext` | The portable execution identity and authority a call runs within: invocation/run/step identity, correlation, principal and tenant, trace, deadline, budget, and secret references. It carries no live handles, no event sink, and no extension escape hatch. |
| `Artifact` | The P1 domain object: a produced or referenced output with identity and provenance. Distinct from the lowercase `artifact` field — the American spelling of the workflow output (1.x used `artefact`). A plain `outcome.artifact` value is not automatically an `Artifact` domain object. |

## Boundaries

| Term | What it is |
| :--- | :--- |
| Capability | A unit of behaviour with a stable contract, exposed through its own subpath export. The "port" in the ports-and-appliances model. |
| Adapter | The appliance that plugs into a capability: a provider, a framework, a runtime, or a UI SDK. Provider types stay behind it. |
| Contract | The typed, JSON-compatible shape at the boundary between your logic and everything it talks to. |

## Qualify bare nouns

The docs never use bare `Context`, `State`, `Memory`, `Task`, `Runtime`,
`Profile`, `Result`, or `Thread`. Each appears in its qualified form
(`InvocationContext`, `ResumableCheckpoint`, `ModelProfile`, `RunResult`, and so
on), so a name always says which one it means.
