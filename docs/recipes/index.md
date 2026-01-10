# Recipes Overview

Recipes are pre-built workflows for common LLM patterns. Each recipe describes a complete flow that handles orchestration, state management, error handling, and integration with models and tools. You describe the behaviour you want, and the recipe turns that description into a runnable workflow.

Recipes form the main entry point for `llm-core`. They give you a stable way to express behaviour while adapters, providers, and infrastructure evolve over time. You keep a clear mental model of your application, even when the surrounding stack changes.

> [!TIP] > **Recipes are functions that return workflows.** When you call a recipe, you receive a handle that you can run, configure, or compose with other recipes.

Related docs: [Recipes API](/reference/recipes-api) and [Composition Model](/reference/composition-model).

## Quick start: Building a chat bot

Many applications begin with a conversational loop. The `chat.simple` recipe gives you a minimal chat flow that can stream responses, call tools, and keep history. It acts as a gentle first contact with the recipes model.

::: tabs
== TypeScript

<<< @/snippets/recipes/simple-chat/quick-start.ts#docs

== JavaScript

<<< @/snippets/recipes/simple-chat/quick-start.js#docs

:::

This example shows the basic shape of a recipe handle. You configure behaviour once, then reuse the handle wherever your system needs a conversational assistant. When you want streaming patterns, diagnostics, and composition in more depth, move to the full [Simple Chat recipe](/recipes/simple-chat).

## Design Philosophy

Recipes separate behaviour from infrastructure.

You describe behaviour through `configure`. In this step you set prompts, temperature, retrieval depth, tool selection, and other options that belong to the problem you solve for your users.

You wire infrastructure through `defaults`. In this step you provide concrete models, vector stores, tools, memory backends, retry defaults, and other dependencies that belong to the runtime environment.

This separation creates a flexible shape.

Configuration for prompts and tools lives close to the code that uses it, so it is easier to reason about why a flow behaves in a certain way.

The same recipe can run in different environments. A development setup can rely on test doubles and local models. A production setup can inject cloud providers and managed stores through `defaults`.

Tests become easier to design. You can supply fakes and lightweight adapters to exercise only the behaviour of a recipe, without carrying real infrastructure into the test suite.

Over time, this pattern encourages a library of small, named recipes that match your domain. Teams can share these recipes across services and UI layers while each project keeps control of its own infrastructure choices.

## Recipe Catalogue

The core library ships with a set of recipes that match common AI engineering patterns. Each recipe can stand on its own or act as a building block inside a larger flow.

| Recipe                              | Description                                                                                |
| :---------------------------------- | :----------------------------------------------------------------------------------------- |
| [Simple Chat](/recipes/simple-chat) | A conversational loop that supports tools, history, and streaming.                         |
| [RAG](/recipes/rag)                 | Retrieval-Augmented Generation that fetches context from a retriever before answering.     |
| [Agent](/recipes/agent)             | A reasoning agent inspired by ReAct patterns that can plan and use tools in several steps. |
| [Ingest](/recipes/ingest)           | A document processing pipeline that splits, embeds, and stores documents.                  |
| [Human-in-the-Loop](/recipes/hitl)  | A flow that pauses execution for human approval or input, suitable for sensitive actions.  |
| [Eval](/recipes/eval)               | Uses an LLM to evaluate outputs from other models or workflows.                            |
| [Loop](/recipes/loop)               | A generic control flow that supports custom iterative processes.                           |

Each recipe comes with its own configuration shape and sensible defaults. You can keep the basic behaviour, adapt a few options, or treat the recipe as a starting point for your own flows.

## Composition

Recipes compose cleanly. One recipe can call another recipe and pass structured input and output between them.

An `agent` recipe can rely on a `rag` recipe as one of its tools. The agent focuses on planning and tool choice, while the `rag` recipe provides a consistent way to fetch and summarise context.

A `rag` recipe can call an `ingest` recipe during setup. In this arrangement the ingest flow prepares a vector store, and the RAG flow uses that store to answer user questions.

An `eval` recipe can run over the outputs of a `simple-chat` recipe. This pattern helps when you run batch evaluations across many test cases, or when you want an automated reviewer inside a larger pipeline.

This style of composition supports a few long term benefits.

You can encapsulate specific behaviours into named recipes and publish them as part of your own internal library. Other teams can pick them up, supply their own infrastructure through `defaults`, and reuse a proven design.

You can introduce new capabilities by adding or swapping recipes rather than reshaping an entire pipeline. For example, a project that already uses `chat.simple` can add `eval` recipes for quality checks or `hitl` recipes for approval flows.

You can keep UI layers and back-end services small and focused. Each surface interacts with a recipe handle instead of a large custom orchestration layer.

See [Composing Recipes](/guide/composing-recipes) for detailed patterns and examples.
