# Why `llm-core`?

When people build AI features today, they tend to follow one of two paths: **gluing** or **orchestrating**.

With **gluing**, you start with a script. You call `openai.chat.completions.create`, you parse a bit of JSON, and you push results into a database. After that you add a retry loop. Later you swap to Anthropic and rework the prompt schema. At some point you add RAG and thread a retrieval call into the middle of that loop. Over time the script turns into a web of conditionals, partials, and helpers that only one person understands.

With **orchestrating**, you describe what should happen and let a runtime do the lifting. You describe steps, state, and outcomes. The runtime tracks those steps, controls state flow, and exposes a clear trace.

`llm-core` sits firmly in the second camp. It is an **orchestration framework** that stays runtime-agnostic and adapter-driven.

- **Recipes** (`recipes.*()`) describe what the system should do.
- The **workflow runtime** executes those recipes in a predictable way.
- **Interactions** map model or query streams into UI-ready state for a single turn.
- **Sessions** hold multi-turn state in a way that does not depend on a specific host.
- **Adapters** align providers and ecosystems while preserving raw payloads.

This structure gives you a graph of steps instead of a ball of glue code, which opens the door to testing, tracing, and reuse that ad-hoc wiring never reaches.

## The unleashed workflow

Once you adopt `llm-core`, you start to treat prompts, flows, and policies as portable assets instead of one-off experiments.

### 1. Portability: verify logic, not frameworks

In many stacks an agent lives inside one framework at a time. You move from LangChain to LlamaIndex for a feature and that move ripples through prompts, routing, and storage.

With `llm-core`, the logic lives inside recipes. Adapters handle LangChain, LlamaIndex, AI SDK, and other ecosystems. The recipe stays the same while the integration layer changes. You review one plan for the workflow rather than a fresh code path every time the ecosystem shifts.

### 2. Recipes: assets instead of scripts

Glue-style code hides logic inside prompt templates, nested callbacks, and framework-specific helpers. Each change lands in another fragment of configuration or code.

Recipes turn that logic into named, versioned assets. A product team can ship a “Research Agent v2” recipe in the same way that a frontend team ships a React component. Recipes receive structured input, produce structured output, and live in source control as part of the domain model rather than as incidental wiring.

### 3. Agility: survive provider churn

Provider choices change for many reasons: pricing adjustments, new models, new latency targets, fresh requirements around data residency.

With `llm-core`, those changes live at the **adapter** and **config** level. You adjust the `model` adapter in a recipe’s defaults and keep the rest of the graph intact. The workflow describes **what** should happen; adapters define **who** runs each part.

### 4. Observability: debug state instead of strings

Large prompts make debugging painful. When an agent fails you often end up scanning through a long prompt or a diff that mixes instructions, examples, and formatting.

`llm-core` records state at each step. The trace shows which step ran, which state it received, and which state it produced. That trace turns incidents into concrete questions: which step mis-interpreted its input, which adapter failed, which configuration changed.

### 5. Experiments as infrastructure

Every workflow in `llm-core` uses small, testable **steps**. That design allows you to test prompts and flows in isolation.

You can replace a “retrieval” step with a mock and test the “generation” step in a unit test. You can run the same agent recipe with a local model during development and a hosted model in production. Experiments move from one-off notebooks into a repeatable, versioned workflow that integrates with the rest of your stack.

## The orchestration shift

Frontend development once relied on direct DOM manipulation with jQuery. Over time, teams moved toward declarative state management and component trees. That shift introduced more structure and constraints, and in exchange gave reliable behaviour and easier reasoning.

`llm-core` aims for a similar shift in AI applications. It encourages:

- Explicit inputs and outputs
- Typed outcomes
- Clearly defined steps and transitions

The framework asks for that structure so that your system remains predictable, inspectable, and robust as it grows.

## The layers you build with

`llm-core` keeps its main concepts small and composable so that you can adopt them in stages.

- **Adapters** align providers and ecosystems while keeping access to raw responses when you need them.
- **Interactions** handle single turns: they take streams of model or tool events and turn them into deterministic UI state.
- **Sessions** handle multi-turn flows: they load state, run a turn, apply your policy, and save state again.
- **Workflows** link many steps together: packs, recipes, and pause / resume flows.

Every layer uses `MaybePromise`, which means you can write sync code where that feels natural and async code when you call external services. The types remain honest in both cases.

## Key takeaways

- Treat LLM logic as **orchestrated recipes** instead of loose scripts.
- Keep **portable assets** that move across LangChain, LlamaIndex, AI SDK, and custom stacks through adapters.
- Prefer **explicit state transitions** and traceable steps over opaque streaming.
- Build on an **adapter-driven core** where providers and tools plug in and full payloads remain available when you need them.
