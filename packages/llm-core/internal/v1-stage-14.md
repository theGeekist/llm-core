# Stage 14 — Composable Recipes (Step Packs)

Status: completed.

## Context

We already have the execution engine: pipeline helpers with DAG ordering
(`dependsOn`, `priority`, `next()`) and resume mechanics for cycles. What is
missing is a public, DX-friendly recipe surface that maps to those helpers
without leaking pipeline terminology.

## Goals

- Provide a public "step" API that compiles to pipeline helpers.
- Support composable recipe packs (multiple packs combine into one recipe).
- Keep adapter swapping intact (packs declare defaults, users override via adapters).
- Maintain determinism and explainability (order + conflicts are explicit).

## Non-goals

- Redesign workflow runtime or pipeline internals.
- Introduce new lifecycle stages beyond existing recipe extension points.
- Change the adapter registry or resume engine semantics.

## Proposed Public Surface

### Recipe packs

```
const RagPack = Recipe.pack("rag", ({ step }) => ({
  extract: step("extract", extract),
  split: step("split", split).dependsOn("extract"),
  embed: step("embed", embed).dependsOn("split"),
  retrieve: step("retrieve", retrieve).dependsOn("embed"),
}));
```

### Composite recipe flow

```
const recipe = Recipe.flow("rag-agent")
  .use(RagPack)
  .use(AgentPack)
  .defaults({ adapters: { model, retriever } })
  .build();
```

## Internal Mapping (Engine)

- `step()` -> `createHelper()` with:
  - `key`: `${packName}.${stepName}` (namespaced)
  - `kind`: same as key (unique helper kind)
  - `dependsOn`: mapped directly
  - `priority`: mapped directly
- `Recipe.pack()` returns a plugin-like bundle:
  - `helperKinds`: list of helper kinds
  - `register(pipeline)`: registers helpers on the pipeline
- `Recipe.flow().use(...)` aggregates packs:
  - collects helper kinds + register hooks
  - compiles to workflow plugins without touching runtime internals

## Contracts + Adapters

- Packs may declare default adapters via `defaults({ adapters })`.
- Users override at call-site via `.use(Adapter...)` or runtime overrides.
- Packs can declare adapter requirements (diagnostic-only by default).

## Conflict Handling

- Step name collisions are warnings by default (diagnostics).
- Optional strict mode: throw on duplicate step names.
- Namespacing is default to avoid accidental collisions.

## Tests

- Pack compilation emits helperKinds + register hook.
- dependsOn ordering is honored by pipeline.
- Multiple packs compose into a single flow.
- Adapter defaults are merged and can be overridden.
- Dogfood the unified `recipes.*` facade in recipe tests (one test per recipe handle).

## Docs

- Add a "Composable Recipes" section to workflow docs.
- Provide a "pack" example (RAG + Agent).
- Map "step" terminology to pipeline helpers (internal reference only).

## Completion summary

- Status: completed
- Notes: Recipe packs + flows are implemented, with plan/build/run wiring, diagnostics on conflicts, and pack-level
  minimum capabilities. Docs cover the public recipe surface and plan introspection.
