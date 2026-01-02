# Advanced Features & Internals

You know about Recipes and Adapters. But `llm-core` has some "advanced capabilities"—safeguards and internals that solve hard problems so you don't have to.

| Feature              | Best For...                                                  |
| :------------------- | :----------------------------------------------------------- |
| **Introspection**    | Debugging why a specific plugin was used or ignored.         |
| **Lifecycle Safety** | Preventing bugs where hooks don't fire.                      |
| **Telemetry**        | Getting consistent token counts across OpenAI/Anthropic.     |
| **Hot-State**        | Pausing an agent to wait for human approval (HITL).          |
| **Content Norm.**    | handling Image/Text/Buffer inputs without conditional logic. |

## 1. Introspection & Control

### Runtime Explainability ("Why did it act like this?")

When you compose complex recipes with plugins overriding other plugins, it's hard to know what the final configuration looks like. `llm-core` builds an **Explain Snapshot** for every runtime.

**Why you care:** You can debug exactly which plugin replaced which, without guessing.

> **Real-World Story: The Silent Plugin Failure**
> You installed a "Security Redaction" plugin to mask PII, but your logs still show emails. Why?
> Another plugin loaded later and silently overrode the tokenizer configuration associated with your security plugin.
>
> **The Fix**: You call `runtime.explain()`. The snapshot reveals that `analytics-plugin` (Priority 10) accidentally replaced `security-plugin` (Priority 5). You fix it by bumping the security priority or using `mode: "override"` explicitly.

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

### Pausing Safely (Hot-State & Serialization)

Most "pause/resume" systems require you to serialize state to a database and reload it. `llm-core` supports **Hot-State Resumption**.

**Why you care:** You can pause a workflow for human approval without inventing your own state machine.

If a workflow pauses (e.g., waiting for a tool), the runtime keeps the _actual iterator_ in memory efficiently.

```ts
// 1. Run until paused
const result = await workflow.run(input);
const token = result.token;

// 2. Resume instantly (in-memory, no DB roundtrip needed if same process)
const nextResult = await workflow.resume({ token, input: "tool output" });
```

The runtime's `snapshotRecorder` also handles **Circular References** and **BigInts** automatically during serialization, so you don't crash when saving complex state.

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

- **Monadic Async Support**: `MaybePromise<T>` (via `src/maybe.ts`) allows utilities to work seamlessly with both sync and async values, avoiding "function coloring" issues.
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

## 5. Putting it Together: The "Doc Review" Story

How do these gems combine in real life? Consider a **Legal Doc Review Agent**.

**The User**: Uploads a PDF contract screenshot and asks, "Is the indemnity clause standard?"

1.  **Unified Input**: You pass the image Buffer and user text to `workflow.run()`. The **Content Normaliser** handles the multi-modal structure automatically.
2.  **Execution**: The agent identifies a suspicious clause but needs a Partner's approval.
3.  **Pause**: The agent returns `status: "paused"` with a `token`. You save this token to your database. The runtime **Hot-State Serializer** ensures the entire analysis state is preserved safely.
4.  **Tracing**: While paused, your dev team inspects the `result.trace`. They see exactly _why_ the agent flagged the clause (Chain-of-Thought reasoning), even though the process is halted.
5.  **Resume**: The Partner clicks "Approve" in your UI. You call `workflow.resume({ token, input: "Approved" })`. The agent wakes up instantly (in-memory if possible) and finishes the job.

**This is the `llm-core` promise**: Complex, long-running, multi-modal workflows made to feel like simple function calls.

## Key Takeaways

- [ ] **Explainability**: Use `runtime.explain()` to debug config overrides.
- [ ] **Safety**: Lifecycle hooks prevent dead code.
- [ ] **Hot-State**: Pause and resume without database boilerplate.
- [ ] **Normalization**: Telemetry and Content are unified across all providers.
