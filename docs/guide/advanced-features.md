# Advanced Features & Internals

This guide covers the **advanced capabilities** you get once you start composing recipes,
adapters, and interactions at scale. It does not repeat the basic orchestration flow; see:

- [Single-Turn Interaction](/guide/interaction-single-turn)
- [Sessions + Transport](/guide/interaction-sessions)
- [Workflow Orchestration](/guide/hello-world)

| Feature                    | Best For...                                                                        |
| :------------------------- | :--------------------------------------------------------------------------------- |
| **Introspection**          | Debugging why a plugin or pack was used or ignored.                                |
| **Lifecycle Safety**       | Preventing hooks that never fire.                                                  |
| **Telemetry**              | Consistent usage/token reporting across providers.                                 |
| **Pause/Resume**           | HITL approvals and long-running workflows.                                         |
| **Content Normalisation.** | Let the Content Normaliser handle image/text inputs without conditional glue code. |

## 1. Introspection & Control

### Runtime Explainability ("Why did it act like this?")

When you compose complex recipes with plugins overriding other plugins, it's hard to know what the final configuration looks like. `llm-core` builds an **Explain Snapshot** for every runtime.

**Why you care:** You can debug exactly which plugin replaced which, without guessing.

> **Why you care**
> You can trace overrides and missing capabilities without guessing.

```ts
const runtime = agent.build();

// Programmatic access to the "resolved" state
console.log(runtime.explain());
```

This snapshot tells you:

- **Overrides**: Which plugins replaced which (e.g., "MockLLM overrides OpenAI").
- **Unused**: Plugins you added but nothing used (dead code detection!).
- **Missing**: Capabilities that are required but not provided.

### Lifecycle Safety Nets

Plugin authors often make mistakes—like hooking into a lifecycle event that doesn't exist. In `default` mode, `llm-core` logs a warning. In `strict` mode, it **crashes the build**.

**Why you care:** Prevents the "Why didn't my analytics plugin fire?" bug that plagues other frameworks.

```ts
import { createLifecycleDiagnostic } from "@geekist/llm-core";

// Extensions.ts internals
if (!isLifecycleScheduled(lifecycleSet, plugin.lifecycle)) {
   // We know BEFORE running that this plugin will never fire
   diagnostics.push(createLifecycleDiagnostic(...));
}
```

### Universal Telemetry Normalisation

Every provider (OpenAI, Anthropic, Ollama) returns token usage, timestamps, and model IDs differently. `llm-core` normalises this into a single, reliable `ModelTelemetry` object:

- **Timestamps**: Always converted to milliseconds.
- **Usage**: Always `inputTokens`/`outputTokens` (normalising `prompt_eval` and `usage_metadata`).
- **IDs**: Reliable `modelId` extraction from nested metadata.

### Plugin Override Mechanics

The `getEffectivePlugins` algorithm isn't just a list merge. It implements a strict **Key-Based Override System**. If you register a plugin with `mode: "override"` and `overrideKey: "base"`, it _surgically replaces_ the base plugin in the execution graph.

## 2. State & Long-Running Flows

### Pausing Safely (HITL + Resume)

If a workflow pauses (e.g., waiting for approval), you get a durable token and can resume later.
This keeps state and trace intact across pauses.

## 3. Inputs & Content

### Universal Content Normalisation

LLM inputs are messy: strings, arrays, buffers, Base64, data URLs. The `Adapter` layer includes a universal content normaliser.

**Why you care:** You don't rewrite your code every time your front-end team changes how it sends images.

```ts
import { toMessageContent } from "@geekist/llm-core/adapters";

// All of these become the SAME standard structure
toMessageContent("hello");
toMessageContent({ parts: [{ type: "text", text: "hello" }] });
toMessageContent(Buffer.from("hello"));
```

### Reasoning & Chain-of-Thought Support

The `MessageContent` primitives natively support a `reasoning` part type, future-proofing your apps for "Thinking Models" (like o1/DeepSeek) even if the current adapter doesn't emit them yet.

### Stream Polyfilling

Not all models support streaming output for structured data (JSON). `llm-core`'s AI SDK adapter detects when a provider refuses to stream objects and gracefully falls back to `generateObject` (non-streaming) or emulates the stream where possible.

## 4. Foundations (Under the Hood)

### Core Utilities & Primitives

The library is built on strong functional foundations:

- **Monadic Async Support**: `MaybePromise<T>` (exported from `@geekist/llm-core`) allows utilities to work seamlessly with both sync and async values, avoiding "function coloring" issues.
- **Centralized Validation**: `src/adapters/input-validation.ts` provides uniform diagnostic warning generation.
- **Universal Query Normalisation**: `src/adapters/retrieval-query.ts` handles converting multi-modal inputs into searchable strings.

### Async Extension Coordination

If a plugin needs to initialize a database connection before the workflow starts, `llm-core` supports **Async Registration**. The runtime automatically waits for all `register` promises to settle before executing the first step.

**Why you care:** Eliminates race conditions during agent startup.

```ts
// Plugin definition
const dbPlugin = {
  key: "database",
  register: async () => {
    await db.connect(); // Runtime waits for this!
    return { ... };
  }
};
```

### The Adapter Polyglot

Adapters function as a **Universal Translator** for the entire AI ecosystem.

- **Bidirectional Tool Interop**: You can use a **LangChain Tool** inside an **AI SDK Agent**. The adapters normalise `Zod` vs `JSON Schema` on the fly.
- **Vector Store Normalisation**: A unified `upsert`/`delete` interface that handles both raw documents and pre-computed vectors.
- **Async Agnosticism**: Wrap a synchronous local embedding model (e.g., ONNX) without forcing an unnecessary `await` tick.

## 5. Putting it Together (Doc Review)

Example: a document review workflow that needs approvals.

1.  **Input**: multi-modal text + image handled by content normalisation.
2.  **Execution**: agent flags a clause and pauses for approval.
3.  **Resume**: workflow continues with trace intact.

## Key Takeaways

- [ ] **Explainability**: use `runtime.explain()` to see overrides and missing capabilities.
- [ ] **Safety**: lifecycle validation prevents dead hooks.
- [ ] **Resilience**: pause/resume keeps state and trace intact.
- [ ] **Normalisation**: telemetry + content stay provider-agnostic.
