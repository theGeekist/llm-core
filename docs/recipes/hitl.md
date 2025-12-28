# Recipe: HITL (Human-in-the-Loop Gate)

> [!NOTE] > **Goal**: Pause a workflow, wait for external input, then resume deterministically.

The HITL recipe is a reusable **gate** that returns a `paused` outcome until a decision arrives.
It integrates with the same resume mechanics used for long-running jobs.

---

## 1) Quick start (pause + resume)

::: tabs
== TypeScript

```ts
import { recipes } from "@geekist/llm-core";
import type { Outcome } from "@geekist/llm-core/workflow";

const gate = recipes.hitl();

const first: Outcome<Record<string, unknown>> = await gate.run({
  input: "Draft a policy update.",
});

if (first.status === "paused") {
  const token = first.token;

  const resumed = await gate.resume?.(token, {
    decision: "approve",
  });

  console.log(resumed?.status);
}
```

== JavaScript

```js
import { recipes } from "@geekist/llm-core";

const gate = recipes.hitl();

const first = await gate.run({ input: "Draft a policy update." });

if (first.status === "paused") {
  const token = first.token;

  const resumed = await gate.resume?.(token, {
    decision: "approve",
  });

  console.log(resumed?.status);
}
```

:::

Related: [Runtime -> paused flow](/reference/runtime#paused-flow)

---

## 2) What the paused outcome contains

A paused outcome always includes:

- `token` - used to resume
- `artefact` - a **partial** snapshot (what has been computed so far)
- `trace` + `diagnostics`

This is guaranteed for every recipe outcome. See [Runtime -> Diagnostics](/reference/runtime#diagnostics).

---

## 3) Durable resume (cache / checkpoint)

By default, pause tokens are process-local. To resume across restarts, provide a cache or checkpoint adapter.

::: tabs
== TypeScript

```ts
import { createMemoryCache } from "@geekist/llm-core/adapters";

const gate = recipes.hitl().defaults({
  adapters: {
    cache: createMemoryCache(),
  },
});
```

== JavaScript

```js
import { createMemoryCache } from "@geekist/llm-core/adapters";

const gate = recipes.hitl().defaults({
  adapters: {
    cache: createMemoryCache(),
  },
});
```

:::

See: [Adapters -> Cache](/reference/adapters-api#cache-adapters-resume-persistence) - [Runtime](/reference/runtime)

---

## 4) Observability: trace + diagnostics

You can inspect pause events and reason about why the gate paused.

::: tabs
== TypeScript

```ts
// gate handle from above
const out = await gate.run({ input: "Draft a policy update." });
console.log(out.trace);
console.log(out.diagnostics);
```

== JavaScript

```js
// gate handle from above
const out = await gate.run({ input: "Draft a policy update." });
console.log(out.trace);
console.log(out.diagnostics);
```

:::

Related: [Recipes API](/reference/recipes-api) - [Runtime -> paused flow](/reference/runtime#paused-flow)

---

## 5) Composition (use it as a gate)

Drop the gate into any recipe with `.use()`.

::: tabs
== TypeScript

```ts
import { recipes } from "@geekist/llm-core";

const guarded = recipes.rag().use(recipes.hitl());
```

== JavaScript

```js
import { recipes } from "@geekist/llm-core";

const guarded = recipes.rag().use(recipes.hitl());
```

:::

---

## Implementation

- Source: [`src/recipes/hitl/index.ts`](https://github.com/theGeekist/llm-core/blob/main/src/recipes/hitl/index.ts)
