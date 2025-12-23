---
layout: home

hero:
  name: llm-core
  text: Build LLM features without glue-code regret
  tagline: Swap providers, keep behavior, and always know why a run behaved that way.
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
  - title: Build LLM features the same way every time
    details: Workflows stay small and explicit, so behavior never surprises you.
  - title: Swap LangChain ↔ AI SDK without rewrites
    details: Adapters normalize providers without leaking their types into your app.
  - title: Every run explains itself
    details: Trace + diagnostics are always present, strict only when you ask for it.
  - title: No hidden magic
    details: Overrides are explicit and explainable, so composition stays deterministic.
---

## LLM workflows feel powerful until they don’t

Types leak. Adapters disagree. One retry changes everything. You end up debugging prompts instead of shipping features.
llm-core is the boring, inspectable path: small surface, explicit composition, and outcomes that always tell you _why_.

## Quick start (TS/JS)

::: tabs
== TypeScript

```ts
import { Workflow } from "@geekist/llm-core/workflow";

const workflow = Workflow.recipe("rag").build();
const result = await workflow.run({ query: "What is Geekist?" });

if (result.status === "ok") {
  console.log(result.artefact.Answer);
}
```

== JavaScript

```js
import { Workflow } from "@geekist/llm-core/workflow";

const workflow = Workflow.recipe("rag").build();
const result = await workflow.run({ query: "What is Geekist?" });

if (result.status === "ok") {
  console.log(result.artefact.Answer);
}
```

:::

## Next

- [Workflow API](/workflow-api)
- [Adapters API](/adapters-api)
- [Runtime model](/runtime)
