# Observability adapters and tracing

Tracing lets you follow how an AI workflow runs, step by step. Each call, tool, and model response can emit events that record timing, token usage, errors, and the payloads that flowed through the pipeline.

In `llm-core`, tracing is built around **trace sinks**. A sink is any destination that receives `AdapterTraceEvent` objects. A sink can be an in-memory collector during tests or a bridge that forwards events into a full observability platform.

---

## Native tracing

### A lightweight default

`llm-core` ships with a small in-memory trace sink that works well during local development and tests. It collects trace events in a plain array and keeps them in process, so you can inspect the full story of a run after it completes.

You can use this native sink when you want to:

- Inspect why a model produced a strange answer by looking at prompts and intermediate steps.
- Assert in tests that a particular tool ran with the arguments you expected.
- Stream trace events to the console while you work on an agent, so you can watch its "thought process" in real time.

### Example: capturing a trace dump

The following example shows how to attach the native sink and read the collected trace after a run.

::: tabs
== TypeScript

<<< @/snippets/adapters/trace-native.ts

== JavaScript

<<< @/snippets/adapters/trace-native.js

:::

---

## LangChain bridge

LangChain has a rich callback system for tracing that powers services such as LangSmith and Lunary. The LangChain trace adapter in `llm-core` turns `AdapterTraceEvent` objects into method calls on a `BaseCallbackHandler`. This allows you to plug `llm-core` workflows into existing LangChain based observability setups.

### Mapped events

The adapter maps core lifecycle events in `llm-core` to LangChain callback methods.

| llm-core event      | LangChain method    | Notes                              |
| :------------------ | :------------------ | :--------------------------------- |
| `run.start`         | `handleChainStart`  | Carries the input payload.         |
| `run.end` (ok)      | `handleChainEnd`    | Carries the final output payload.  |
| `run.end` (error)   | `handleChainError`  | Carries the error and stack trace. |
| `provider.response` | `handleLLMEnd`      | Carries model usage and outputs.   |
| _Custom_            | `handleCustomEvent` | Carries any additional telemetry.  |

### Usage

To use the bridge, wrap any `BaseCallbackHandler` in a trace sink and attach it to your workflow runtime or adapter bundle.

::: tabs
== TypeScript

<<< @/snippets/adapters/trace-langchain.ts

== JavaScript

<<< @/snippets/adapters/trace-langchain.js

:::

You can keep using your existing LangChain handlers and dashboards while `llm-core` handles the workflow side.

---

## Supported integrations

Trace sinks are designed to be composable. You can attach several sinks to the same workflow, for example an in-memory sink for tests and a LangChain or LlamaIndex sink for external observability.

Current tracing integrations include:

| Ecosystem      | Adapter factory                | Deep link                                                                                 |
| :------------- | :----------------------------- | :---------------------------------------------------------------------------------------- |
| **LangChain**  | `fromLangChainCallbackHandler` | [Docs](https://api.js.langchain.com/classes/core_callbacks_base.BaseCallbackHandler.html) |
| **LlamaIndex** | `fromLlamaIndexTraceSink`      | [Docs](https://ts.llamaindex.ai/docs/api/modules/workflow_core_middleware_trace_events)   |

These factories produce trace sinks that you can pass into your `llm-core` setup in exactly the same way as the native sink.

---

## LlamaIndex bridge

LlamaIndex workflows can emit trace events through trace plugins. The LlamaIndex trace adapter in `llm-core` listens to those workflow events and converts them into `AdapterTraceEvent` objects.

This gives you a consistent trace shape across:

- Native `llm-core` workflows.
- LangChain based stacks.
- LlamaIndex based stacks.

With that shared event format, you can:

- Record traces in a single store, even when the underlying ecosystem changes.
- Reuse the same analysis or dashboards across different runtimes.
- Move from one framework to another while keeping your observability story stable.

### Usage

The following example shows how to wrap a LlamaIndex workflow with a trace plugin and connect it to `llm-core`.

::: tabs
== TypeScript

<<< @/snippets/adapters/trace-llamaindex.ts

== JavaScript

<<< @/snippets/adapters/trace-llamaindex.js

:::

Once configured, LlamaIndex events flow into your chosen sinks just like events from any other adapter.
