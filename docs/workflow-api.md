# Workflow API (DX First)

The Workflow API is intentionally tiny. You start from a recipe name, compose plugins, build a runtime, and run it.
All runs return a structured outcome with trace + diagnostics. Sync or async — it’s always `MaybePromise`.

## Quick Start

```ts
import { Workflow, Outcome } from "#workflow";

const wf = Workflow.recipe("rag")
  .use({ key: "model.openai", capabilities: { model: { name: "gpt-4.1" } } })
  .use({ key: "retriever.vector", capabilities: { retriever: { type: "vector" } } })
  .build();

const out = await wf.run({ input: "What is a capybara?" });

Outcome.match(out, {
  ok: ({ artefact }) => artefact["answer.text"],
  needsHuman: ({ token }) => `Need approval: ${String(token)}`,
  error: ({ error }) => `Failed: ${String(error)}`,
});
```

Recipes ship with minimal default plugins. `.use(...)` extends or overrides those defaults.

## Surface Area

- `Workflow.recipe(name)` -> builder
- `.use(plugin)` -> compose
- `.build()` -> runnable workflow
- `.run(input, runtime?)` -> outcome union (ok | needsHuman | error)
- `.resume(token, humanInput?, runtime?)` -> only if a recipe exposes it
- `wf.capabilities()` -> resolved capabilities (override-aware; list-like adapters surface as presence flags)
- `wf.explain()` -> composition snapshot (declared + resolved capabilities, overrides, unused, missing requirements)
- `wf.contract()` -> declared recipe contract

## Recipe Name Drives Inference

Literal names are the typed path:

```ts
const wf = Workflow.recipe("agent"); // typed input + artefacts
```

Dynamic strings intentionally widen and fall back to runtime diagnostics.

## Outcomes Are Always Present

`run()` returns a union with `trace` and `diagnostics` attached:

```ts
type Outcome<TArtefact> =
  | { status: "ok"; artefact: TArtefact; trace: TraceEvent[]; diagnostics: unknown[] }
  | {
      status: "needsHuman";
      token: unknown;
      artefact: Partial<TArtefact>;
      trace: TraceEvent[];
      diagnostics: unknown[];
    }
  | { status: "error"; error: unknown; trace: TraceEvent[]; diagnostics: unknown[] };
```

### Helpers

```ts
Outcome.ok(out); // type guard
Outcome.match(out, handlers); // exhaustive handling
Outcome.mapOk(out, fn); // transforms ok artefact only
```

## Sync and Async by Default

`run()` returns `MaybePromise`. If the pipeline is sync, you can stay sync:

```ts
const out = wf.run({ input: "sync-call" });
if (out.status === "ok") {
  // no await required
}
```

## Runtime Channel (Operational Concerns)

Runtime carries operational concerns; plugins carry behavior.

```ts
const runtime = {
  reporter: { warn: (msg, ctx) => console.warn(msg, ctx) },
  diagnostics: "default",
  budget: { maxTokens: 2000 },
  persistence: {
    /* adapter */
  },
  traceSink: {
    /* sink */
  },
  hitl: {
    /* adapter */
  },
};

await wf.run({ input: "..." }, runtime);
```

## Explain and Contract

`explain()` is the source of truth for “why is it shaped like this?”

```ts
wf.explain();
// {
//   plugins: [...],
//   capabilities: {...},         // resolved, override-aware
//   declaredCapabilities: {...}, // raw declared
//   overrides: [...],
//   unused: [...],
//   missingRequirements: [...]
// }
```

`contract()` always returns the declared recipe contract (stable, reviewable).

## Resume (HITL Recipes)

`resume()` only exists for recipes that explicitly support it. If present, it accepts a token and optional human input.
Current behavior is a stub until a HITL adapter contract is wired.
