# Tools and Parsers for Agency and Logic

## What is a Tool?

Tools give a language model practical abilities. They turn a simple chat experience into an agent that can call code, reach external services, or query data sources.

A tool describes a single capability. It gives the model four things:

1. **Name**: an identifier for the model, for example `get_weather`.
2. **Description**: guidance that explains when the model should call this tool.
3. **Schema**: a machine readable description of arguments, for example `{ city: string }`.
4. **Implementation**: the JavaScript function that runs when the model chooses this tool.

### The Logic Loop

```mermaid
graph LR
    LLM[Model] -->|1. Call| Router{Router}
    Router -->|JSON| Tool[Tool Execution]
    Tool -->|Result| LLM
    Router -->|Text| User([User])
```

The model selects a tool and calls the router. The router validates arguments, executes the implementation, and feeds the result back into the model. The user sees a conversation, while the system coordinates calls, schemas, and side effects in the background.

---

## 1. Tool adapters

`llm-core` brings order to schemas from different ecosystems. Libraries such as AI SDK, LangChain, and LlamaIndex describe tools through Zod, JSON Schema, or custom TypeScript types. The adapters in this package turn those shapes into one consistent interface.

The goal is simple: describe tools once in the ecosystem you prefer and run them inside `llm-core` with the same behaviour and error handling.

### The native path: AI SDK with Zod

**Recommended for: building tools in your own codebase**

Use this path when you design tools for your own application. The AI SDK `tool` helper with Zod gives strong type inference and runtime validation, which suits greenfield work and teams that already rely on the AI SDK.

The adapter reads the Zod schema from your AI SDK tool and exposes it through the `llm-core` tool interface. The model receives clear argument shapes and rich descriptions while your code stays close to upstream AI SDK patterns.

- **Upstream documentation**: [`tool`](https://sdk.vercel.ai/docs/reference/ai-sdk-core/tool)

::: tabs
== TypeScript

<<< @/snippets/adapters/tool-ai-sdk.ts

== JavaScript

<<< @/snippets/adapters/tool-ai-sdk.js

:::

### The catalogue path: LangChain tools

**Recommended for: reusing existing integrations**

LangChain ships with a wide catalogue of tools: Google Search, Wikipedia, Zapier, Python interpreters, and many others. You can keep that surface area and still work inside `llm-core`.

The adapter wraps any LangChain `Tool` or `StructuredTool` and presents it as a `llm-core` tool. The router drives the call, handles streaming where relevant, and reports usage through a single tracing story across ecosystems.

- **Upstream documentation**: [`Tool`](https://api.js.langchain.com/classes/core_tools.Tool.html)

::: tabs
== TypeScript

<<< @/snippets/adapters/tool-langchain.ts

== JavaScript

<<< @/snippets/adapters/tool-langchain.js

:::

LlamaIndex tools also fit into this model through the `fromLlamaIndexTool` adapter. The result is a single tool interface in `llm-core` that can wrap tools from AI SDK, LangChain, or LlamaIndex while your application code interacts with one shape.

---

## 2. Output parsers

Output parsers convert free form model text into structured data.

Before structured output and tool calling became common in model APIs, output parsers served as the main way to shape model text into JSON. The pattern still helps in three situations.

### When to use parsers

1. **Legacy models**: older families such as Llama 2 or early GPT‑3 expose plain text APIs. Output parsers provide structure on top of that text.
2. **Clean up**: parsers can repair common JSON mistakes such as trailing commas or inconsistent quoting.
3. **Special formats**: some workflows prefer CSV, XML, or values pulled out through regular expressions.

The LangChain `BaseOutputParser` interface remains a practical foundation for these tasks. `llm-core` can wrap an existing parser or help you route output through a custom parser that aligns with your data model.

::: tabs
== TypeScript

<<< @/snippets/adapters/parser-langchain.ts

== JavaScript

<<< @/snippets/adapters/parser-langchain.js

:::

Parsers pair well with tools. A model can call a tool, receive rich unstructured text in reply, then send that text through a parser that produces shapes ready for storage, further retrieval, or follow up prompts.

---

## Supported integrations for tools and parsers

Tool and parser adapters in `llm-core` cover three major ecosystems. Each row in the table shows how a capability in `llm-core` maps to an upstream interface.

| Capability | Ecosystem  | Adapter factory             | Upstream interface         | Deep link                                                                              |
| :--------- | :--------- | :-------------------------- | :------------------------- | :------------------------------------------------------------------------------------- |
| **Tool**   | AI SDK     | `fromAiSdkTool`             | `Tool` with Zod schema     | [Docs](https://sdk.vercel.ai/docs/reference/ai-sdk-core/tool)                          |
| **Tool**   | LangChain  | `fromLangChainTool`         | `Tool` or `StructuredTool` | [Docs](https://api.js.langchain.com/classes/core_tools.Tool.html)                      |
| **Tool**   | LlamaIndex | `fromLlamaIndexTool`        | `BaseTool`                 | [Docs](https://ts.llamaindex.ai/api/interfaces/BaseTool)                               |
| **Parser** | LangChain  | `fromLangChainOutputParser` | `BaseOutputParser`         | [Docs](https://api.js.langchain.com/classes/core_output_parsers.BaseOutputParser.html) |

This matrix gives a quick reference for the surfaces `llm-core` covers. Tool adapters focus on execution and argument schemas, while parser adapters focus on turning model text into data. Together they create an interop layer across AI SDK, LangChain, LlamaIndex, and the wider JavaScript and TypeScript ecosystem.
