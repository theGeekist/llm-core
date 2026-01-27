---
title: Workflow API
---

# Workflow API (Advanced)

This page describes the **engine surface** behind recipes. Most users should start with
[Recipes API](/reference/recipes-api). The workflow API is for advanced control: execution
outcomes, runtime overrides, capability introspection, and resume semantics.

---

## 1) What a Workflow is

A workflow is the compiled execution graph produced by a recipe handle. You still **author** with
recipes, but you **execute** with workflows.

```js
import { recipes } from "@geekist/llm-core/recipes";

const workflow = recipes.agent().build();
const outcome = await workflow.run({ input: "Do work." });
```

---

## 2) Surface area (engine methods)

The workflow instance is the engine. These methods are the advanced surface:

- `.run(input, runtime?)` — execute and return an outcome.
- `.resume(token, resumeInput?, runtime?)` — resume paused runs (only if supported).
- `.capabilities()` — resolved capabilities (override-aware).
- `.declaredCapabilities()` — declared capabilities only (plugin-only).
- `.adapters()` — resolved adapter bundle (defaults + overrides).
- `.declaredAdapters()` — declared adapters only (plugin-only).
- `.explain()` — composition snapshot (diagnostics, overrides, missing requirements).
- `.contract()` — declared recipe contract.

---

## 3) Builder surface (advanced)

`Workflow.recipe(name)` returns a builder with the same ergonomic surface as recipe/interaction handles:

- `configure({ diagnostics?, pipelineFactory? })` — advanced wiring + diagnostics hooks.
- `defaults(runtime)` — runtime defaults (retry, providers, diagnostics mode).
- `use(plugin)` — add plugins (adapters, hooks, helpers).
- `explain()` — composition snapshot (plugins, capabilities, overrides, requirements).
- `build()` — returns a workflow runtime.
- `run(input, runtime?)` — one‑shot execution.

Use the builder when you want advanced control without touching recipes directly.

---

## 4) Outcomes are explicit

Every `run()` returns an outcome with trace and diagnostics.

```js
const out = await workflow.run({ input: "..." });

if (out.status === "ok") {
  console.log(out.artefact);
}
if (out.status === "paused") {
  console.log(out.token);
}
if (out.status === "error") {
  console.error(out.error);
}
```

Helpers live in `Outcome.*` and remain exhaustive.

---

## 5) Agent loop contract (interaction semantics)

The agent loop contract is defined in the interaction layer, not the workflow engine. It describes
the **event semantics** and **state snapshot** shape that an agentic loop must emit, regardless of
adapter ecosystem. This keeps the engine stable while letting the interaction stream evolve.
See [Runtime / Agent Loop Snapshots](/reference/runtime#agent-loop-snapshots) for snapshot rules.

Core types are exported from `@geekist/llm-core/interaction`:

- `AgentLoopConfig` — user-facing agent loop configuration.
- `AgentLoopStateSnapshot` — deterministic snapshot for resume semantics.
- `InteractionItemEvent` — `interaction.item.*` lifecycle events.
- `InteractionSubagentEvent` — `interaction.subagent.*` lifecycle events.

The workflow engine is responsible for trace + diagnostics, but the agent loop contract is where
UI integrations and deterministic replay are defined.

---

## 6) Runtime channel (operational controls)

Runtime is where **budget**, **persistence**, **trace sinks**, and **resume** are configured. This
keeps recipes pure and deterministic.

```ts
import type { Runtime } from "@geekist/llm-core/workflow";

const runtime: Runtime = {
  diagnostics: "default",
  reporter: { warn: (msg, ctx) => console.warn(msg, ctx) },
  budget: { maxTokens: 2000 },
  traceSink: { emit: () => true },
  resume: { resolve: () => ({ input: "resume" }) },
};

await workflow.run({ input: "..." }, runtime);
```

---

## 7) Sync or async (MaybePromise)

Workflows are sync‑friendly when all adapters are sync.

```js
const out = workflow.run({ input: "sync-call" });
if (out.status === "ok") {
  // no await needed when sync
}
```

---

## 8) Capabilities and explain()

`explain()` is the source of truth for **why** a workflow is shaped the way it is.

```js
const snapshot = await workflow.explain();
// { plugins, capabilities, declaredCapabilities, overrides, unused, missingRequirements }
```

Use `capabilities()` when you want the resolved shape for feature‑gating or diagnostics.

---

## 9) Resume (HITL workflows)

`resume()` only exists for recipes that explicitly support pause/resume. It accepts a resume token
and optional human input. The runtime `resume` adapter determines how tokens are resolved.

---

## 10) Provider overrides (registry)

Workflows resolve construct providers via the adapter registry. Per‑run overrides are supported via
`runtime.providers`:

```js
await workflow.run(
  { input: "..." },
  { providers: { model: "ai-sdk:openai:gpt-4o-mini", retriever: "llamaindex:vector" } },
);
```

---

## 11) When to read this page

- You’re building your own runtime wrapper.
- You need full control over resume, diagnostics, or provider selection.
- You want to introspect capabilities or explain composition.

Otherwise, stay in [Recipes API](/reference/recipes-api).
