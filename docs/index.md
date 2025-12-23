# llm-core

Composable workflow + adapter core for the JS/TS LLM ecosystem.

## Start here

- Workflow API: `workflow-api.md`
- Adapters API: `adapters-api.md`
- Runtime model: `runtime.md`

## What this gives you

- One workflow surface for RAG, agents, and HITL-style flows.
- Adapter contracts to normalize LangChain, LlamaIndex, and AI SDK.
- Diagnostics and trace data that are always present.

## Quick start

```ts
import { Workflow } from "@geekist/llm-core/workflow";

const workflow = Workflow.recipe("rag").build();
const result = await workflow.run({ query: "What is Geekist?" });

if (result.status === "ok") {
  console.log(result.artefact.Answer);
}
```

## How to contribute

```bash
bun install
bun run lint
bun run typecheck
bun test
```
