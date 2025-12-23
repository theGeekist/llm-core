---
layout: home

hero:
  name: llm-core
  text: A DX-first LLM runtime core
  tagline: Composable workflows and adapters for a fragmented JS/TS ecosystem.
  image:
    src: /logo.png
    alt: llm-core logo
  actions:
    - theme: brand
      text: Get Started
      link: /workflow-api
    - theme: alt
      text: Adapters API
      link: /adapters-api

features:
  - title: Workflow-first
    details: One clean surface for RAG, agents, HITL gates, and loops.
  - title: Adapter ecosystem
    details: Normalize LangChain, LlamaIndex, and AI SDK without leaking types.
  - title: Diagnostics always on
    details: Trace + diagnostics come back with every run, strict when you want it.
  - title: Deterministic composition
    details: Explicit overrides, capability checks, and a stable explain snapshot.
---

## Quick start

```ts
import { Workflow } from "@geekist/llm-core/workflow";

const workflow = Workflow.recipe("rag").build();
const result = await workflow.run({ query: "What is Geekist?" });

if (result.status === "ok") {
  console.log(result.artefact.Answer);
}
```

## Next

- Workflow API: `workflow-api.md`
- Adapters API: `adapters-api.md`
- Runtime model: `runtime.md`
