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
      link: /guide/hello-world
    - theme: alt
      text: Core Concepts
      link: /guide/core-concepts

features:
  - title: Migrate Ecosystems
    details: Move from LangChain to LlamaIndex to AI SDK without rewriting your business logic.
  - title: Ship Stable Recipes
    details: Stop shipping "fragile scripts". creating versioned, testable Agent Recipes that behave predictably.
  - title: Swap Providers Instantly
    details: OpenAI rate-limited? Switch to Anthropic or local Llama via config. No code changes.
  - title: Unified Runtime
    details: One way to run agents across your entire company, regardless of the underlying tools.
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

- [Workflow API](/reference/workflow-api)
- [Adapters API](/reference/adapters-api)
- [Runtime model](/reference/runtime)
