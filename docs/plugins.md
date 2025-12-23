# Plugins (Capabilities + Overrides)

Plugins are the smallest unit of composition. They describe what they add, what they need, and how they extend the recipe.
They are deterministic: order matters, and overrides are explicit.

## The Shape

::: tabs
== TypeScript

```ts
type Plugin = {
  key: string;
  mode?: "extend" | "override";
  overrideKey?: string;
  capabilities?: Record<string, unknown>;
  requires?: string[];
  emits?: string[];
  helperKinds?: string[];
  lifecycle?: string;
  hook?: PipelineExtensionHook<unknown, unknown, unknown>;
  register?: (
    pipeline: unknown,
  ) => MaybePromise<PipelineExtensionRegisterOutput<unknown, unknown, unknown>>;
};
```

== JavaScript

```js
const plugin = {
  key: "model.openai",
  mode: "extend",
  overrideKey: "model.openai",
  capabilities: { model: { name: "gpt-4.1" } },
  requires: ["tools"],
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
const wf = Workflow.recipe("agent")
  .use({ key: "model.openai", capabilities: { model: { name: "gpt-4.1" } } })
  .use({
    key: "model.openai.override",
    mode: "override",
    overrideKey: "model.openai",
    capabilities: { model: { name: "gpt-4.1-mini" } },
  })
  .build();
```

== JavaScript

```js
const wf = Workflow.recipe("agent")
  .use({ key: "model.openai", capabilities: { model: { name: "gpt-4.1" } } })
  .use({
    key: "model.openai.override",
    mode: "override",
    overrideKey: "model.openai",
    capabilities: { model: { name: "gpt-4.1-mini" } },
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
const tracePlugin = {
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

### Default Lifecycle

`init` is the default lifecycle. If a plugin omits `lifecycle`, it attaches to `init`.

If a plugin declares `lifecycle` but the recipe does not schedule it, the workflow emits a diagnostic.

## Register vs Hook

- `hook` is the simple path: attach to a named lifecycle.
- `register` gives full access to pipeline extension registration.

If `register` includes a `lifecycle` and the recipe doesn’t schedule it, you still get a diagnostic.

Overrides apply here too: overridden plugins do **not** register extensions.

## Helper Kinds

`helperKinds` installs pipeline helpers that run as stages.

Override rules apply: helper kinds only come from **effective** plugins.
