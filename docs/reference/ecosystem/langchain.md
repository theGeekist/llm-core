# LangChain Integration

**LangChain (JS/TS)** is supported primarily as a bridge to widely-used tools and retrievers. Use this if you have existing LangChain assets you want to orchestrate.

## Installation

```bash
npm install @langchain/core @langchain/community
```

## Features Supported

| Feature             | Support    | Notes                                                              |
| :------------------ | :--------- | :----------------------------------------------------------------- |
| **Models**          | ✅ Full    | `BaseChatModel` supported.                                         |
| **Tools**           | ✅ Full    | `DynamicTool`, `StructuredTool` supported.                         |
| **Embeddings**      | ✅ Full    | `EmbeddingsInterface` supported.                                   |
| **Retrievers**      | ✅ Full    | `BaseRetriever` supported.                                         |
| **Vector Stores**   | ✅ Full    | `VectorStore` (write path) supported.                              |
| **Memory**          | ⚠️ Partial | `BaseListChatMessageHistory` supported (simple).                   |
| **Chains/Runnable** | ❌ Opaque  | Chains are treated as black boxes; use `llm-core` recipes instead. |
| **Callbacks**       | ❌ Ignored | LangChain callbacks are not bridged to `llm-core` traces.          |

## Quick Start (Tools)

Reuse any standard LangChain tool (like `WikipediaQueryRun` or `SerpAPI`).

```ts
import { Adapter, fromLangChainTool } from "@geekist/llm-core/adapters";
import { Calculator } from "@langchain/community/tools/calculator";

const calc = new Calculator();

const wf = Recipe.flow("agent")
  .use(Adapter.tools("calc", [fromLangChainTool(calc)]))
  .build();
```

## Quick Start (Retrievers)

This is the most common use-case: using LangChain components for the "R" in RAG.

```ts
import { Adapter, fromLangChainRetriever } from "@geekist/llm-core/adapters";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { OpenAIEmbeddings } from "@langchain/openai";

const store = await MemoryVectorStore.fromTexts(...);
const retriever = store.asRetriever();

const wf = Recipe.flow("rag")
  .use(Adapter.retriever("lc-memory", fromLangChainRetriever(retriever)))
  .build();
```

## Known Limitations

- **Chains**: We do not recommend wrapping `RunnableSequence` or `LLMChain` inside `llm-core`. It hides the logic. Instead, break the chain apart: use the LangChain _components_ (Model, Prompt, Retriever) but let `llm-core` manage the _flow_.
- **Output Parsers**: Not supported. `llm-core` handles structured output parsing at the Model Adapter layer.
