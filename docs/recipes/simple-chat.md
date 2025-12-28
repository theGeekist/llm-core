# Tutorial: Building a Chatbot

The **Simple Chat** recipe is your starting point. It gives you a reliable, production-ready conversation loop in one line of code.

But real applications aren't generic. You need to verify inputs, switch models for cost, and inject personality.

This guide walks you through **using** and **customizing** the Simple Chat recipe.

## 1. The Basics

At its core, a Chatbot needs two things: a **Model** (the brain) and a **Workflow** (the engine).
We provide the engine (`simpleChat`). You provide the brain.

<<< @/../tests/recipes/simple-chat.test.ts#basic

## 2. "Make it behave like a Pirate" (Configuration)

The first thing you'll likely want to do is control the persona.
We don't hide this in a complex class; we just expose a simple configuration object.

```ts
const pirateBot = recipes.simpleChat({
  system: "You are a pirate. End every sentence with 'Arrr!'.",
});

// The system prompt is now baked into the recipe.
const result = await pirateBot.run({ input: "Hello" });
```

## 3. "I want to use a cheaper model" (Adapters)

This is where the power of `llm-core` shines. You might use **GPT-4** for complex tasks, but **GPT-4o-mini** for simple chat.
You don't need to rewrite your application. You just swap the **Adapter**.

An "Adapter" is simply a plug. The Recipe is the socket.

```ts
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { fromAiSdkModel } from "@geekist/llm-core/adapters";

// Option A: The Expensive Brain
const gpt4 = fromAiSdkModel(openai("gpt-4"));

// Option B: The Fast Brain
const claude = fromAiSdkModel(anthropic("claude-3-haiku"));

// Run with Option A
await recipe.run(input, { adapters: { model: gpt4 } });

// Run with Option B (No code changes!)
await recipe.run(input, { adapters: { model: claude } });
```

## 4. "How does it actually work?" (Deep Dive)

Under the hood, `simpleChat` isn't doing anything magic. It is just a pre-configured workflow that registers a **Model Plugin** and a **System Prompt Plugin**.

You could build this yourself using `Recipe.flow()`, but we've saved you the boilerplate.

```text
graph TD
    A --> B
```

## Source Code

Want to see exactly how we implemented it? It's just one file.

<<< @/../src/recipes/simple-chat.ts
