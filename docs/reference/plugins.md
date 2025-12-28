# Plugins (Capabilities + Overrides)

**Note: This is a low-level API.** Most users should use **Recipes** (`recipes.*()`).
Packs compile down to Plugins.

Plugins are the smallest unit of composition in the Engine. A plugin is a bag of extensions: capabilities, helpers, and lifecycle hooks that a recipe can install. They describe what they add, what they need, and how they extend or override other plugins. They are deterministic: order matters, and overrides are explicit.

## The Shape

::: tabs
== TypeScript

```ts
import type { Plugin } from "#workflow";

const plugin: Plugin = {
  key: "model.openai", // stable identifier (namespaced)
  mode: "extend", // extend = add, override = replace
  overrideKey: "model.openai", // which plugin this one replaces
  capabilities: { model: { name: "gpt-4.1" } }, // config / declared capabilities bag
  requires: ["tools"], // capabilities this plugin expects
  emits: ["model"], // capabilities this plugin contributes
  helperKinds: ["recipe.steps"], // pipeline helpers this plugin installs
  lifecycle: "beforeAnswer", // lifecycle this plugin hooks into
  hook: ({ state }) => console.log(state), // simple lifecycle hook
};
```

== JavaScript

```js
const plugin = {
  key: "model.openai", // stable identifier (namespaced)
  mode: "extend", // extend = add, override = replace
  overrideKey: "model.openai", // which plugin this one replaces
  capabilities: { model: { name: "gpt-4.1" } }, // config / declared capabilities bag
  requires: ["tools"], // capabilities this plugin expects
};
```

:::

## Extend vs Override

- **extend** (default) adds capabilities and helpers.
- **override** replaces any earlier plugin with the same `overrideKey`.

Example:

::: tabs
== TypeScript

```ts
import { recipes } from "#recipes";
import type { Plugin } from "#workflow";

const plugins: Plugin[] = [
  { key: "model.openai", capabilities: { model: { name: "gpt-4.1" } } },
  {
    key: "model.openai.override",
    mode: "override",
    overrideKey: "model.openai",
    capabilities: { model: { name: "gpt-4.1-mini" } },
  },
];

const wf = recipes
  .agent()
  .defaults({
    plugins,
  })
  .build();
```

== JavaScript

```js
import { recipes } from "#recipes";

const wf = recipes
  .agent()
  .defaults({
    plugins: [
      { key: "model.openai", capabilities: { model: { name: "gpt-4.1" } } },
      {
        key: "model.openai.override",
        mode: "override",
        overrideKey: "model.openai",
        capabilities: { model: { name: "gpt-4.1-mini" } },
      },
    ],
  })
  .build();
```

:::

## Capabilities (Declared vs Resolved)

`capabilities()` returns the **resolved** set (override-aware).
`explain()` returns both:

- `capabilities` = resolved
- `declaredCapabilities` = raw declared

This keeps “what’s installed” separate from “what actually won.”

## Lifecycles and Hooks

Plugins can hook into recipe lifecycles:

::: tabs
== TypeScript

```ts
import type { Plugin } from "#workflow";

const tracePlugin: Plugin = {
  key: "trace.console",
  lifecycle: "beforeAnswer",
  hook: async ({ state }) => {
    console.log("Answer about to render", state);
  },
};
```

== JavaScript

```js
const tracePlugin = {
  key: "trace.console",
  lifecycle: "beforeAnswer",
  hook: async ({ state }) => {
    console.log("Answer about to render", state);
  },
};
```

:::

## Where plugins come from

In most cases you don’t construct plugins by hand. Instead, higher-level helpers create them for you:
**Adapter helpers (low-level):**

- Adapter.model("openai", ...)
- Adapter.retriever("qdrant", ...)
- These produce plugins that install adapters and their helperKinds.
- Workflow helpers (higher-level):
- recipes.agent().defaults({ plugins: [{ key: "model.openai", ... }] })
- Recipe.pack("rag", ({ step }) => ({ ...steps })) compiles steps into helpers and wraps them in a plugin.

At runtime, Workflow.build() always sees just a list of plugins. The engine doesn’t care whether they came from Adapter.\*, Recipe.pack, or custom code.

### Default Lifecycle

`init` is the default lifecycle. If a plugin omits `lifecycle`, it attaches to `init`.

If a plugin declares `lifecycle` but the recipe does not schedule it, the workflow emits a diagnostic.

## Register vs Hook

- `hook` is the simple path: attach to a named lifecycle.
- `register` gives full access to pipeline extension registration.

If `register` includes a `lifecycle` and the recipe doesn’t schedule it, you still get a diagnostic.

Overrides apply here too: overridden plugins do **not** register extensions.

## Helper Kinds & Recipes

`helperKinds` are how plugins participate in the pipeline DAG.

Override rules apply: helper kinds only come from **effective** plugins and Recipes (or packs) decide which helperKinds to schedule as “steps”; plugins provide the implementations.
