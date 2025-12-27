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

```ts
import { Adapter, createBuiltinTrace } from "@geekist/llm-core/adapters";
import type { AdapterTraceEvent, AdapterTraceSink } from "@geekist/llm-core/adapters";

// 1. Create a sink (typed)
const builtin = createBuiltinTrace();
const trace: AdapterTraceSink = Adapter.trace("local.trace", builtin);

// 2. Emit from a pack or adapter step
await trace.emitMany?.([
  { name: "run.start", data: { input } },
  { name: "provider.response", data: { usage: { inputTokens: 12, outputTokens: 42 } } },
  { name: "run.end", data: { status: "ok" } },
]);

// 3. Inspect the timeline (builtin-only)
const events = (builtin as { events?: AdapterTraceEvent[] }).events ?? [];
console.log(JSON.stringify(events, null, 2));

/*
Output:
[
  {
    "name": "run.start",
    "timestamp": 1719234000000,
    "data": { "input": "Why is the sky blue?" }
  },
  {
    "name": "provider.response",
    "timestamp": 1719234001500,
    "modelId": "claude-3-5-sonnet",
    "data": {
      "usage": { "inputTokens": 15, "outputTokens": 45 }
    }
  },
  {
    "name": "run.end",
    "timestamp": 1719234001505,
    "data": { "output": "Rayleigh scattering..." }
  }
]
*/
```

== JavaScript

```js
import { Adapter, createBuiltinTrace } from "@geekist/llm-core/adapters";

// 1. Create a sink (vanilla)
const builtin = createBuiltinTrace();
const trace = Adapter.trace("local.trace", builtin);

// 2. Emit from a pack or adapter step
await trace.emitMany?.([
  { name: "run.start", data: { input } },
  { name: "provider.response", data: { usage: { inputTokens: 12, outputTokens: 42 } } },
  { name: "run.end", data: { status: "ok" } },
]);

// 3. Inspect the timeline (builtin-only)
console.log(JSON.stringify(builtin.events ?? [], null, 2));
```

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

```ts
import { Adapter, fromLangChainCallbackHandler } from "@geekist/llm-core/adapters";
import { RunCollectorCallbackHandler } from "@langchain/core/tracers/run_collector";

const handler = new RunCollectorCallbackHandler();
const trace = Adapter.trace("custom.trace", fromLangChainCallbackHandler(handler));
```

== JavaScript

```js
import { Adapter, fromLangChainCallbackHandler } from "@geekist/llm-core/adapters";
import { RunCollectorCallbackHandler } from "@langchain/core/tracers/run_collector";

const handler = new RunCollectorCallbackHandler();
const trace = Adapter.trace("custom.trace", fromLangChainCallbackHandler(handler));
```

:::

---

## Supported Integrations

| Ecosystem     | Adapter Factory                | Deep Link                                                                                 |
| :------------ | :----------------------------- | :---------------------------------------------------------------------------------------- |
| **LangChain** | `fromLangChainCallbackHandler` | [Docs](https://api.js.langchain.com/classes/core_callbacks_base.BaseCallbackHandler.html) |
