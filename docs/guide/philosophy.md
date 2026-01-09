# Why `llm-core`?

There are two ways to build AI applications today: **Gluing** and **Orchestrating**.

**Gluing** is easier to start. You write a script, manually call `openai.chat.completions.create`, parse the JSON, and maybe save it to a database. Then you add a retry loop. Then you switch to Anthropic and rewrite the prompt structure. Then you add RAG and rewrite the loop.

**Orchestrating** is different. You define _what_ you want to happen using declarative **Recipes**, and a specialized runtime makes it happen.

`llm-core` is an **Orchestration Framework** that stays runtime-agnostic and adapter-driven.

- **Recipes** (`recipes.*()`) declare what the system should do.
- **Workflow runtime** executes those recipes deterministically.
- **Interactions** project model/query streams into UI-ready state for single turns.
- **Sessions** orchestrate multi-turn state without coupling to any host environment.
- **Adapters** normalize providers and ecosystems while keeping raw details intact.

It imposes structure (Recipes, Packs, Steps) to give you superpowers that ad-hoc wiring can never support.

## The Unleashed Workflow

When you adopt `llm-core`, you unify API differences and start building portable assets.

### 1. Portability: Verify Logic, Not Frameworks

**The Old Way**: You rewrite your agent because you switched from LangChain to LlamaIndex to chase a feature.
**The New Way**: You write your logic in `llm-core`. It runs on _any_ ecosystem via adapters. The recipe survives; only the plumbing changes.

### 2. Recipes: Assets, Not Scripts

**The Old Way**: Logic is hidden in prompt templates and nested callbacks ("Spaghetti").
**The New Way**: Workflows are named, versioned **Recipes**. Product teams ship "Research Agent v2" as a tangible asset, just like a React component.

### 3. Agility: Survive The Churn

**The Old Way**: OpenAI boosts pricing or changes rate limits. You rewrite code to switch providers.
**The New Way**: You swap the `model` adapter in config. The graph doesn't care who completes the prompt.

### 4. Observability: Debug State, Not Strings

**The Old Way**: An agent fails. You stare at a 300-line prompt diff trying to spot the drift.
**The New Way**: You look at the trace graph. You see exactly which step received what input. You debug the state transition, not the string.

### 5. Experiments as Infrastructure

Because every workflow is built from small, testable **Steps**, you can unit test your prompts. You can swap the "Retrieval" step for a mock to test the "Generation" logic. Experiments stop being mystical blobs and become solid infrastructure.

## The Orchestration Shift

If you remember when frontend development moved from manual DOM manipulation (jQuery) to declarative state management, you know the feeling of trading "easy" for "predictable".

`llm-core` is that shift for AI. It asks you to accept constraints—explicit inputs, typed outcomes, defined steps—in exchange for a system that is predictable, inspectable, and robust.

## The Layers You Build With

`llm-core` keeps each layer small and composable so you can build only what you need:

- **Adapters** normalize providers and ecosystems without locking you in.
- **Interactions** are single-turn projections: stream events → deterministic state.
- **Sessions** are orchestration wrappers: load state, run a turn, apply policy, save.
- **Workflows** are multi-step orchestration: packs, recipes, and pause/resume.

Every layer uses `MaybePromise` so sync and async behaviors stay honest.

## Key Takeaways

- **First-class Orchestration**: Use declarative recipes, not scripts.
- **Portable Assets**: Verify logic once, run anywhere.
- **Deterministic State**: Prefer explicit state transitions over opaque streaming.
- **Adapter-Driven**: Providers are pluggable; raw payloads are preserved.
