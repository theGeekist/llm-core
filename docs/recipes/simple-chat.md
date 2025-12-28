# Recipe: Simple Chat (Preset + Base Handle)

> [!NOTE] > **Goal**: A minimal, low-friction entry point that wires model/system defaults.

Simple Chat is intentionally small: it **does not introduce extra steps**. Instead, it provides a
recipe handle that sets model/system defaults and can be composed into richer flows.

If you want a full agentic loop, see the [Agent recipe](/recipes/agent). If you want RAG + chat, see
[RAG](/recipes/rag).

If you're new to recipes, skim the [Recipes API](/reference/recipes-api) for the handle surface.

---

## 1) Quick start (system + model defaults)

::: tabs
== TypeScript

```ts
import { simpleChat } from "@geekist/llm-core/recipes";
import { fromAiSdkModel } from "@geekist/llm-core/adapters";
import { openai } from "@ai-sdk/openai";
import type { SimpleChatConfig } from "@geekist/llm-core/recipes";

const config = {
  system: "You are a helpful coding assistant.",
  model: "gpt-4o-mini",
} satisfies SimpleChatConfig;

const chat = simpleChat(config).defaults({
  adapters: {
    model: fromAiSdkModel(openai("gpt-4o-mini")),
  },
});
```

== JavaScript

```js
import { simpleChat } from "@geekist/llm-core/recipes";
import { fromAiSdkModel } from "@geekist/llm-core/adapters";
import { openai } from "@ai-sdk/openai";

const chat = simpleChat({
  system: "You are a helpful coding assistant.",
  model: "gpt-4o-mini",
}).defaults({
  adapters: {
    model: fromAiSdkModel(openai("gpt-4o-mini")),
  },
});
```

:::

Related: [Recipes API](/reference/recipes-api) - [Adapters overview](/reference/adapters)

---

## 2) Use it as a base (compose with other recipes)

Because Simple Chat only wires defaults, pair it with another recipe's steps.

::: tabs
== TypeScript

```ts
import { recipes, simpleChat } from "@geekist/llm-core/recipes";

const chat = simpleChat({
  system: "You are a helpful coding assistant.",
}).use(recipes.agent());

const outcome = await chat.run({ input: "Explain DSP." });
```

== JavaScript

```js
import { recipes, simpleChat } from "@geekist/llm-core/recipes";

const chat = simpleChat({
  system: "You are a helpful coding assistant.",
}).use(recipes.agent());

const outcome = await chat.run({ input: "Explain DSP." });
```

:::

---

## 3) Diagnostics + trace

Even when used as a preset, you still get full diagnostics and trace from the composed recipe.

::: tabs
== TypeScript

```ts
// chat handle from above
const outcome = await chat.run({ input: "Explain DSP." }, { runtime: { diagnostics: "strict" } });

console.log(outcome.diagnostics);
console.log(outcome.trace);
```

== JavaScript

```js
// chat handle from above
const outcome = await chat.run({ input: "Explain DSP." }, { runtime: { diagnostics: "strict" } });

console.log(outcome.diagnostics);
console.log(outcome.trace);
```

:::

Related: [Runtime -> Diagnostics](/reference/runtime#diagnostics) - [Runtime -> Trace](/reference/runtime#trace)

---

## Implementation

- Source: [`src/recipes/simple-chat.ts`](https://github.com/theGeekist/llm-core/blob/main/src/recipes/simple-chat.ts)
