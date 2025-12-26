# AI SDK Integration

`llm-core` treats the **AI SDK (Vercel)** as a first-class citizen. It is the recommended path for most new applications because of its lightweight nature and modern stream primitives.

## Installation

You install the AI SDK and its providers directly. `llm-core` does not bundle them.

```bash
npm install ai @ai-sdk/openai @ai-sdk/anthropic
```

## Features Supported

| Feature         | Support       | Notes                                                         |
| :-------------- | :------------ | :------------------------------------------------------------ |
| **Chat Models** | ✅ Full       | Supports `text`, `structured`, and `tool` modes.              |
| **Streaming**   | ✅ Polyfilled | V3 streaming is normalized; "Obj-only" models are polyfilled. |
| **Tools**       | ✅ Full       | Native Zod schemas are automatically converted.               |
| **Embeddings**  | ✅ Full       | `embed` and `embedMany` supported.                            |
| **Image Gen**   | ✅ Full       | `generateImage` supported.                                    |
| **Speech**      | ✅ Full       | `generateSpeech` and `transcribe` supported.                  |
| **Retrieval**   | ❌ Missing    | AI SDK has no retrieval primitive; use LangChain/LlamaIndex.  |

## Quick Start (Model)

Wrap any AI SDK model with `fromAiSdkModel`.

```ts
import { Adapter, fromAiSdkModel } from "@geekist/llm-core/adapters";
import { openai } from "@ai-sdk/openai";

const wf = Recipe.flow("agent")
  .use(Adapter.model("openai", fromAiSdkModel(openai("gpt-4o"))))
  .build();
```

## Quick Start (Tools)

AI SDK tools (with Zod schemas) work natively. You don't need a wrapper if you pass them to the `tools` adapter, but we provide helpers for explicit creation.

```ts
import { z } from "zod";
import { tool } from "ai";

const myTool = tool({
  description: "Get weather",
  parameters: z.object({ city: z.string() }),
  execute: async ({ city }) => ({ temp: 22 }),
});

// Pass directly to adapter
Adapter.tools("weather", [myTool]);
```

## Known Limitations

- **RAG**: The AI SDK does not have a standard "Retriever" or "Vector Store" interface. If you need RAG, we recommend mixing in **LlamaIndex** or **LangChain** adapters for that specific part of the pipeline.
- **Middleware**: Provider-specific middleware hooks (like Vercel AI SDK wrappers) are generally preserved but not normalized into the `llm-core` trace.
