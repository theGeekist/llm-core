# Advanced Control

Standard recipes cover 90% of use cases. But sometimes you need to reach into the engine and take control.

This guide covers the mechanisms that let you inspect, override, and extend the core behavior of `llm-core`.

---

## 1) Introspection ("What is my agent actually doing?")

When you stack multiple recipes and overrides, it can be hard to know what the final configuration looks like.

The **Explain API** solves this. It gives you a snapshot of the _resolved_ execution graph.

```ts
const runtime = agent.build();

// Returns the full DAG of steps
console.log(runtime.explain());
```

**Why you care**: You can verify exactly which plugin replaced which. If your "Security Pack" was supposed to override the "Memory Pack", the explain graph will prove it.

---

## 2) Lifecycle Safety

In many frameworks, if you register a hook that doesn't exist, it just silently fails. You wonder why your analytics aren't showing up.

`llm-core` validates the lifecycle. If you try to hook into a step that isn't part of the recipe, it warns you. In **strict mode**, it crashes the build.

**Why you care**: It creates a safety net for plugin authors. You know _before_ you deploy if your extension is compatible with the recipe version.

---

## 3) Telemetry Normalisation

Every provider reports token usage differently. Some use `usage_metadata`, others use `prompt_eval_count`. Timestamps vary between seconds and milliseconds.

`llm-core` normalises all of this into a single `ModelTelemetry` shape attached to every outcome.

- **Timestamps**: Always milliseconds.
- **Usage**: Always `inputTokens` / `outputTokens`.
- **IDs**: Reliable model IDs extracted from provider-specific fields.

**Why you care**: Your analytics dashboards don't need `if (provider === 'anthropic')` logic. You just log the `outcome.trace`.

---

## 4) Async Internals ("The Adapter Polyglot")

Adapters act as a universal translator not just for APIs, but for runtime behavior.

- **Async Registration**: If a plugin needs to connect to a database before the workflow starts, the runtime waits for its `register()` promise to settle. It eliminates race conditions at startup.
- **Stream Polyfilling**: If a model doesn't support streaming JSON, the AI SDK adapter gracefully falls back to a non-streaming call or emulates the stream. Your code doesn't change.
- **Bidirectional Interop**: You can use LangChain tools inside an AI SDK agent. The adapters normalize the schema (Zod vs JSON Schema) on the fly.

**Why you care**: You stop writing "glue code" to make libraries talk to each other. The core handles the translation layer.

# Advanced Control

Standard recipes handle most workflows. Sometimes you want to open the engine, see every moving part, and adjust it yourself.

This guide walks through the features that expose the internals of `llm-core`. You can inspect graphs, enforce lifecycle rules, read normalised telemetry, and coordinate async work across adapters.

---

## 1) Introspection: see what the agent is doing

When you stack several recipes, packs, and overrides, configuration can feel opaque. You might wonder which plugin finally wins for a given step or which adapter actually runs a model call.

The Explain API answers that by returning a resolved execution graph.

```ts
const runtime = agent.build();

// Returns the full DAG of steps
console.log(runtime.explain());
```

The explain graph shows every step, its key, and the plugin or recipe that supplied it. You can confirm that a "Security Pack" replaced a "Memory Pack" at a given step and that a particular adapter backs a model call. During reviews you can point at a stable graph rather than chasing through configuration files.

---

## 2) Lifecycle safety

Many frameworks accept hook registrations even when the recipe lacks a matching hook. The code runs, logs stay empty, and you are left guessing why observability faded.

`llm-core` validates lifecycle wiring. When you attach a hook to a step outside the recipe, the system raises a diagnostic. When you enable strict mode, that diagnostic turns into a hard failure during build time.

Why this matters: plugin authors gain a safety net. Incompatible changes between recipes and packs surface while you develop, long before deployment.

---

## 3) Telemetry normalisation

Every provider reports token usage in a slightly different shape. Some send `usage_metadata`, others send `prompt_eval_count`. Time fields also arrive in mixed units.

`llm-core` normalises these fields into a single `ModelTelemetry` shape on every outcome.

- Timestamps always use milliseconds since epoch.
- Usage fields describe `inputTokens` and `outputTokens` with per-call totals.
- Model identifiers resolve into a consistent `modelId`, regardless of provider naming.

You can log `outcome.trace` once and reuse the same schema across providers. Dashboards read a single shape instead of branching on provider names or field conventions.

---

## 4) Async internals: the adapter polyglot

Adapters act as a universal translator for APIs and for runtime behaviour.

Async registration allows plugins to perform setup work before a workflow starts. A plugin can connect to a database or warm a cache inside `register()`, and the runtime waits for that promise before it runs any steps. Startup race conditions shrink dramatically when every dependency declares its preparation phase.

Stream polyfilling handles models that lack streaming JSON events. The AI SDK adapter falls back to a non-streaming call or synthesises a stream from the final response. Application code continues to rely on a single streaming contract.

Bidirectional interop connects ecosystems. You can wire a LangChain tool into an AI SDK agent, or route AI SDK tools through a LangChain workflow. Adapters reconcile schema differences on either side so recipes follow a single tool shape.

Why this matters: you spend time on domain logic while the core coordinates providers, tools, and async behaviour behind the scenes.
