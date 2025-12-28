# Tutorial: Building an Agent

An **Agent** is an LLM that can allow itself to "do" things.
While a Chatbot just talks, an Agent can search the web, query databases, or update tickets.

In `llm-core`, an Agent is constructed from three distinct capabilities:

1.  **Tools**: The hands (Functions it can call).
2.  **Planning**: The brain (How it decides what to call).
3.  **Memory**: The notebook (Remembering past actions).

## 1. "Teach it to use a Calculator" (Tools)

The most common customization is giving the Agent tools.
We support standard schemas (Zod/JSON Schema).

```ts
import { tool } from "ai";
import { z } from "zod";

// 1. Define the tool
const calculator = tool({
  description: "Add two numbers",
  parameters: z.object({ a: z.number(), b: z.number() }),
  execute: async ({ a, b }) => a + b,
});

// 2. Give it to the Recipe
const mathAgent = recipes.agent().defaults({
  adapters: {
    // The recipe automatically registers these with the Model
    tools: { calculator },
  },
});
```

## 2. "It needs to remember me" (Memory)

By default, an Agent is stateless. If the server restarts, it forgets everything.
To make it persistent, you plug in a **Memory Native Adapter**.

```ts
const redisMemory = {
  // Simple interface: load() and save()
  load: async (id) => redis.get(`chat:${id}`),
  save: async (id, messages) => redis.set(`chat:${id}`, messages),
};

const persistentAgent = recipes.agent().defaults({
  adapters: { memory: redisMemory },
});
```

Now, when you run `activeAgent.run({ input: "Hi", threadId: "session-123" })`, it automatically hydrates its history from Redis.

## 3. The Architecture

The Agent recipe is a sophisticated orchestration of multiple Packs. Notice the strict ordering: Memory loads _before_ Tools are registered, which happens _before_ Planning begins.

```text
graph TD
    A --> B
```

## Source Code

<<< @/../src/recipes/agentic/index.ts
