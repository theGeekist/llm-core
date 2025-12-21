# Implementation Plan (Workflow Runtime)

Purpose: detailed, staged plan with pipeline API anchors and mandatory doc updates at each stage.
Guardrails: return early, minimal nesting, each module/test under 500 SLOC, readable by default.

Related docs:

- `docs/workflow-notes.md` (canonical overview)
- `docs/recipes-and-plugins.md` (catalogue)

## Pipeline API References (Installed Package)

We use the installed `@wpkernel/pipeline` package at runtime. Local source can be consulted
for understanding, but the npm package is the runtime contract.

- Core pipeline factory: `node_modules/@wpkernel/pipeline/dist/core/makePipeline.js`
- Extension builder: `node_modules/@wpkernel/pipeline/dist/core/createExtension.js`
- Extension hooks runner: `node_modules/@wpkernel/pipeline/dist/core/extensions/runner.js`
- Extension registration: `node_modules/@wpkernel/pipeline/dist/core/registration.js`
- Types (helpers, diagnostics, steps): `node_modules/@wpkernel/pipeline/dist/core/types.d.ts`
- Runner stages and lifecycle stages: `node_modules/@wpkernel/pipeline/dist/core/runner/program.js`
- Helper rollbacks and extension rollback: `node_modules/@wpkernel/pipeline/dist/core/runner/rollback.js`

## Pseudo Modules (Proposed)

Keep each module under 500 SLOC.

1. `src/workflow/recipe-registry.ts`

   - registers recipe contracts and defaults
   - exposes typed lookup by recipe name

2. `src/workflow/builder.ts`

   - `Workflow.recipe(name)` builder
   - `.use(plugin)` composition with mode handling
   - `.build()` returns runnable workflow

3. `src/workflow/runtime.ts`

   - `.run(input, runtime?)` with Outcome union
   - `.resume(token, humanInput?, runtime?)` for HITL recipes
   - runtime presets (optional)

4. `src/workflow/plugins/types.ts`

   - public plugin shape (opaque)
   - internal plugin contract resolved types

5. `src/workflow/plugins/adapter.ts`

   - maps plugins -> pipeline extensions/helpers
   - registers lifecycles for recipes

6. `src/workflow/contract.ts`

   - `wf.contract()` view
   - contract metadata for JS users

7. `src/workflow/explain.ts`

   - `wf.explain()` snapshot
   - uses diagnostics, overrides, missing requirements (plugin requires) and minimum capabilities (recipe contract)

8. `src/workflow/diagnostics.ts`

   - diagnostic severity mapping (warn vs strict failure)
   - consistent diagnostic payload shape

9. `src/workflow/outcome.ts`

   - Outcome algebra helpers (`match`, `ok`, `mapOk`)

10. `src/workflow/trace.ts`
    - trace event shape and minimal emitter
    - ensures trace always present in Outcome

## Stage 0 — Alignment + Contracts (Docs First)

Code:

- Define Recipe contract shape (typed internally, name-literal drives inference).
- Add a contract registry in `src/workflow/recipe-registry.ts`.

Docs:

- Update `docs/workflow-notes.md` with explicit contract lookup path.
- Update `docs/recipes-and-plugins.md` to show canonical artefact keys per recipe.

Exit criteria:

- Contract registry compiles.
- Recipe names drive inference without user generics.

## Stage 1 — Builder + Plugin Composition

Code:

- Implement `Workflow.recipe(name)` in `src/workflow/builder.ts`.
- `.use(plugin)` stores plugin descriptors and override mode.
- `.build()` validates contract + plugin requirements (diagnostic only in default mode; strict promotes to error).

Docs:

- Add a short “Builder lifecycle” section in `docs/workflow-notes.md`.
- Add a one-line example showing `.use(...).build()` in `docs/workflow-notes.md`.

Exit criteria:

- Builder composes plugins deterministically.
- Override semantics are captured in `explain()` data model (even if not surfaced yet).

## Stage 2 — Extension Adapter (Pipeline Mapping)

Status: completed. See `docs/stage-2.md` for the detailed checklist.

## Stage 3 — Runtime + Outcome + Diagnostics

Status: completed. See `docs/stage-3.md` for the detailed checklist.
Note: explain() + contract() were completed as part of Stage 3.

## Stage 4 — Recipes + Minimum Capabilities

Status: completed. See `docs/stage-4.md` for the detailed checklist.

## Stage 5 — Recipes + Plugin Catalogue Wiring

Status: completed. See `docs/stage-5.md` for the detailed checklist.

## Stage 6 — Tests + SLOC Discipline

Status: planned. See `docs/stage-6.md` for the detailed checklist.

## Stage 7 — Interoperability Adapters (Deferred)

Code:

- Add an opt-in adapter layer for external ecosystems (e.g., LangChain, LlamaIndex, Vercel AI SDK).
- Focus on narrow boundary translation (inputs/outputs, tool calls, traces/diagnostics) without changing core Workflow DX.
- Keep adapters as separate modules (or packages) so the core stays small and stable.
- Treat external adapter packages as peer dependencies when work begins.
- Revisit monorepo structure when adapters are introduced (to manage peer deps cleanly and avoid core churn).

Docs:

- Add a short note describing what “first-class interoperability” means here (bridge, not reimplementation).
- Document a minimal example that wraps an external chain/index into a Workflow plugin.

Exit criteria:

- One adapter can run end-to-end via a small example without widening core types.
- Workflow contracts/recipes remain the source of truth; adapters translate to/from them.

## Ongoing Constraints

- Prefer early returns and small pure functions.
- Avoid deep nesting by splitting helpers into single-purpose functions.
- Add short, precise comments only for non-obvious logic.
- Update docs in each stage to prevent drift.
