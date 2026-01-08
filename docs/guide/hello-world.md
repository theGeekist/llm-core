# Workflow Orchestration (RAG + HITL)

This guide shows a full end-to-end workflow: an **agent** that retrieves data (RAG), streams
through a deterministic pipeline, and can pause for human approval (HITL).

If you are new to interaction sessions or single-turn UI projection, start here first:

- [Single-Turn Interaction](/guide/interaction-single-turn)
- [Sessions + Transport](/guide/interaction-sessions)

---

## 1) Working demo

<<< @/snippets/guide/workflow-orchestration.js#docs

What you get:

- Multi-step orchestration (agent loop + retrieval + HITL).
- Deterministic ordering, trace, diagnostics.
- Pause/resume hooks for real approvals.

Under the hood:

- The **RAG pack** expects a `retriever` adapter port.
- The **HITL pack** is what introduces the paused outcome.

---

## 2) Options and interoperability

### Swap model providers

```diff
- import { createBuiltinModel } from "@geekist/llm-core/adapters";
+ import { fromAiSdkModel } from "@geekist/llm-core/adapters";
+ import { openai } from "@ai-sdk/openai";

- model: createBuiltinModel(),
+ model: fromAiSdkModel(openai("gpt-4o-mini")),
```

### Swap retriever implementations

```js
import { fromLangChainRetriever } from "@geekist/llm-core/adapters";
import { MemoryVectorStore } from "langchain/vectorstores/memory";

const store = new MemoryVectorStore(/* embeddings */);
const retriever = fromLangChainRetriever(store.asRetriever());
```

### Override packs without rewriting the flow

```js
const workflow = recipes
  .agent()
  .use(recipes["agent.planning"]()) // override planning
  .use(recipes.rag())
  .defaults({ adapters: { model, retriever } })
  .build();
```

---

## 3) Why this is better than ad-hoc orchestration

- **Deterministic execution**: DAG ordering replaces implicit async chains.
- **Pause/resume**: HITL is a first-class runtime concept.
- **Interoperability**: swap model and retriever ecosystems without touching business logic.

---

## Next steps

- [Composing Recipes](/guide/composing-recipes)
- [Debugging](/guide/debugging)
- [Adapters Reference](/reference/adapters-api)
