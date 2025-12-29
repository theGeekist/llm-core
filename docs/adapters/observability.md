# Observability Adapters (Tracing)

## What is Tracing?

Tracing allows you to observe the execution of your AI workflows. It captures latency, token usage, errors, and input/output payloads across every step of the pipeline.

In `llm-core`, we normalize tracing into **Trace Sinks**. A sink is simply a destination for `AdapterTraceEvent` objects.

## Native Tracing

**The Minimalist Approach**

You don't need to install heavy observability SDKs just to see what your AI is doing. `llm-core` ships with a lightweight, in-memory trace sink you can emit to from packs or adapters.

### When to use this?

- **Debugging**: Quickly dump the trace to see why a model hallucinated.
- **Testing**: Assert that a specific tool was called with specific arguments.
- **Local Dev**: See the "thought process" of your agent in the console.

### Example: capturing a "Trace Dump"

::: tabs
== TypeScript

<<< @/snippets/adapters/trace-native.ts

== JavaScript

<<< @/snippets/adapters/trace-native.js

:::

## LangChain Bridge

LangChain has a mature callback ecosystem for tracing (e.g., LangSmith, Lunary). We provide an adapter that maps `llm-core` lifecycle events into LangChain callbacks.

### Mapped Events

| llm-core Event      | LangChain Method    | Notes                    |
| :------------------ | :------------------ | :----------------------- |
| `run.start`         | `handleChainStart`  | Maps input payloads.     |
| `run.end` (ok)      | `handleChainEnd`    | Maps output payloads.    |
| `run.end` (error)   | `handleChainError`  | Maps error stack.        |
| `provider.response` | `handleLLMEnd`      | Maps model usage.        |
| _Custom_            | `handleCustomEvent` | For all other telemetry. |

### Usage

Wrap any `BaseCallbackHandler` into a Trace Sink:

::: tabs
== TypeScript

<<< @/snippets/adapters/trace-langchain.ts

== JavaScript

<<< @/snippets/adapters/trace-langchain.js

:::

---

## Supported Integrations

| Ecosystem      | Adapter Factory                | Deep Link                                                                                 |
| :------------- | :----------------------------- | :---------------------------------------------------------------------------------------- |
| **LangChain**  | `fromLangChainCallbackHandler` | [Docs](https://api.js.langchain.com/classes/core_callbacks_base.BaseCallbackHandler.html) |
| **LlamaIndex** | `fromLlamaIndexTraceSink`      | [Docs](https://ts.llamaindex.ai/docs/api/modules/workflow_core_middleware_trace_events)   |

---

## LlamaIndex Bridge

LlamaIndex workflows can emit trace events via trace plugins. This adapter maps workflow handler events to `AdapterTraceEvent`.

### Usage

::: tabs
== TypeScript

<<< @/snippets/adapters/trace-llamaindex.ts

== JavaScript

<<< @/snippets/adapters/trace-llamaindex.js

:::
