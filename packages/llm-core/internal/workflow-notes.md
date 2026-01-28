# Workflow Product Notes (Draft)

Canonical overview. Companion details live in `docs/recipes-and-plugins.md`, `docs/workflow-api.md`,
`docs/adapters.md`, `docs/adapters-api.md`, `docs/plugins.md`, and `docs/runtime.md`.

## Nouns (What’s What)

- Recipe: the contract + extension points + minimum capabilities. Defines the workflow.
- Plugin: composable unit that installs capabilities and can extend/override deterministically.
- Adapter: concrete implementation of a construct (model, retriever, tools, etc).
- Extension: pipeline lifecycle hook/registration used by plugins to inject behavior.

### Relationship map

```mermaid
flowchart TB
  Recipe -->|defaults + requirements| Workflow
  Plugin -->|use()| Workflow
  Plugin -->|installs| Adapter
  Plugin -->|registers| Extension
  Adapter -->|implements| Construct
  Workflow -->|resolves| AdapterRegistry
  AdapterRegistry -->|selects| Adapter
  Extension -->|hooks| Pipeline
```

## DX Guardrails (Type Safety + Defaults)

- Recipe name drives inference. Literal names are the typed path; dynamic strings intentionally widen and rely on runtime diagnostics (escape hatch for JS-ish call sites).
- Diagnostics severity over strictness: default mode is permissive + diagnosable; "strict" upgrades requirement/contract diagnostics to errors and fails.
- Recipe minimum capabilities are enforced via diagnostics (default warn, strict error).
- Capabilities are inferred from resolved adapters to avoid strict-mode surprises; explicit capabilities still win. List-like adapters (documents/messages/tools/prompts/schemas) are surfaced as presence flags in capabilities when they contain items, while full lists stay on adapters. `model` surfaces the adapter instance, not a boolean flag.
- Adapter bundles are discoverable on the runtime (`wf.adapters()`), and return resolved adapters (registry defaults + constructs merged). Use `wf.declaredAdapters()` for plugin-only.
- `wf.declaredCapabilities()` exposes the plugin-only capability view; `wf.capabilities()` reflects resolved adapters.
- Adapter metadata may declare hard requirements (construct/capability). Registry resolution emits warnings (strict mode fails).
- Avoid user-facing generics. If an escape hatch is needed, prefer value-first:
  - `Workflow.recipe("rag").contract(myContract)` (typed value or schema drives inference)
  - If `.as<Contract>()` exists, document it as rare/advanced only.
- Runtime presets are illustrative (e.g., dev/prod) to avoid option sprawl and keep operational concerns centralized.
- `explain()` returns a single snapshot: resolved capabilities, declared capabilities, overrides, missing requirements, unused/shadowed registrations, optional "why" hints.
- Expose a contract view for discoverability (`wf.contract()`), stick to one noun.
- Outcome ergonomics should be small and explicit: `Outcome.match`, `Outcome.ok` type guard, and optional `Outcome.mapOk`.

## DX Story (15 Minutes)

1. Start with a Recipe: pick a known use case (agent, RAG, eval, HITL).
2. Compose Plugins: add capabilities like Model, Tools, Retriever, Memory, Trace.
3. Build: `build()` returns a Workflow (runnable). The builder is a transient composer.
4. Run: get a typed outcome + artefact + trace + diagnostics by default.
5. Override: swap a plugin or override a helper key with deterministic results.
6. Resume: if a run returns `paused`, `resume` is exposed for supported recipes and uses `runtime.resume.resolve(...)`.

Design intent:

- Outcome types are small algebraic unions (ok | paused | error).
- Runs return monadic, typed containers where `MaybePromise` is the baseline for sync/async.
- FP-friendly composition: plugins are pure descriptors, runs are deterministic.

Two DX anchors:

- Capability discovery is first-class (illustrative, not API commitment):
  ```ts
  wf.capabilities(); // -> { model: ..., tools: true, retriever?: ..., memory?: ... }
  wf.explain(); // -> { plugins: [...], capabilities: {...}, declaredCapabilities: {...}, overrides: [...], unused: [...] }
  ```
- Runtime carries operational concerns (budget, persistence, resume adapter, tracing sink), while plugins carry behavioral concerns.

## Glossary

- Core: internal pipeline engine (DAG resolution, lifecycle bus, diagnostics).
- Workflow: "one object to run" runtime with typed artefact contract and outcome union.
- Plugin: composable unit that installs capabilities and can extend/override deterministically.
- Recipe: opinionated bundle that declares an artefact contract and default plugins.
- Capability: concrete feature area (Model, Tool, Retriever, Memory, Evaluator, Trace).
- Artefact: structured data produced during a run (IR/fragments, traces, scores).
- Run: one execution instance with inputs, budgets, and outputs.

## Product Shape

- Core/internal: pipeline engine, DAG resolution, lifecycle bus, diagnostics engine.
- Workflow: "one object to run", typed artefact contract, outcome union, trace/diagnostics always available.
- Plugin: installs capabilities; can extend/override deterministically.
- Recipe: declares an artefact contract; plugins enrich or override fragments within that contract.

## Minimal Public Surface

- `Workflow.recipe(name)` -> builder
- `.use(plugin)` -> compose
- `.build()` -> runnable
- `.run(input, runtime?)` -> outcome union
- `.resume(token, resumeInput?)` -> outcome union (recipe-provided, only if needed; requires `runtime.resume`)

Override should be expressed either:

- plugin property (mode: "override")
- alias: `use(plugin.override())`

Verb list stays small: recipe, use, build, run, resume.

## Builder Lifecycle

`Workflow.recipe(name)` creates a transient composer. You can `.use(...)` multiple plugins
in order, then call `.build()` once to snapshot the configuration into a runnable workflow.
After build, the runtime is deterministic even if the builder is mutated.
Recipe defaults are loaded automatically; `.use(...)` extends or overrides them.

Example:

```ts
const wf = Workflow.recipe("rag")
  .use(Model.openai({ model: "gpt-4.1" }))
  .use(Retriever.vector({ store: "docs" }))
  .build();
```

## Plugin Model

Plugin should declare:

- what it adds (capabilities)
- what it overrides (optional)
- what it emits (artefact fragments)
- what it needs (dependencies / required capabilities)

Goal: good DX and introspection for conflicts without exposing core plumbing.

## Recipe Catalogue Contracts

Each recipe defines:

- inputs
- primary artefacts
- termination outcomes (ok | paused | error)
- extension points (named in recipe terms, mapped to lifecycles internally)

Example: Tool-calling Agent contract:

- input: AgentInput
- artefacts: Plan, ToolCall[], ToolResult[], Answer, Confidence
- outcomes: ok / paused / error
- extension points: beforePlan, afterToolExec, beforeAnswer

Notes:

- Trace explains what happened; diagnostics explain why this shape happened.

## Loops

Explicit semantics:

- loops are recipes with an iteration controller
- each iteration runs a deterministic inner workflow
- controller decides continue/stop based on artefacts + budget

This gives LangGraph-like behavior without a LangGraph-like API.

## Implementation Direction (Use Extensions)

These names (`createPipelineExtension`, `makeLifecycleStage`) refer to existing **core** pipeline constructs. They are mentioned here only to anchor how plugins/recipes map to what already exists. They are _not_ part of the user-facing Workflow API.

Yes: the pipeline extensions API is a good foundation for plugins and runtime behavior.

How it maps:

- Plugin -> pipeline extension (via `createPipelineExtension`).
- Plugin.setup registers helpers (stages, DAG nodes) on the pipeline.
- Plugin.hook runs at recipe lifecycles to transform artefacts or emit trace.
- Recipe defines lifecycle names; stages call `makeLifecycleStage(name)` to trigger hooks.
- Runtime concerns (trace sinks, persistence, resume adapters) can be extensions that hook
  lifecycle stages and commit/rollback as needed.

Why it fits:

- Extensions already support commit/rollback, MaybePromise, and deterministic ordering.
- Hooks run sequentially per lifecycle and can transform artefacts without leaking core wiring.
- Diagnostics can include extension coverage (hooks registered but lifecycle skipped).

Notes:

- Keep helper registration in `setup` to avoid plumbing in user code.
- Reserve lifecycle names for recipe extension points (beforePlan, afterToolExec, etc.).
- `init` is the default lifecycle; plugins without an explicit lifecycle attach to `init`, and recipes should schedule it.

## Minimal Implementation Sketch (TypeScript)

```ts
type Runtime = {
  budget?: Budget;
  traceSink?: TraceSink;
  persistence?: PersistenceAdapter;
  resume?: ResumeAdapter;
};

type Outcome<TArtefact> =
  | { status: "ok"; artefact: TArtefact; trace: TraceEvent[]; diagnostics: Diagnostic[] }
  | {
      status: "paused";
      token: ResumeToken;
      artefact: TArtefact;
      trace: TraceEvent[];
      diagnostics: Diagnostic[];
    }
  | { status: "error"; error: unknown; trace: TraceEvent[]; diagnostics: Diagnostic[] };

type WorkflowRuntime<TRunInput, TArtefact> = {
  run: (input: TRunInput, runtime?: Runtime) => MaybePromise<Outcome<TArtefact>>;
  // illustrative: some recipes support resume with a typed human input
  resume?: (
    token: ResumeToken,
    resumeInput?: unknown,
    runtime?: Runtime,
  ) => MaybePromise<Outcome<TArtefact>>;
  capabilities: () => CapabilityMap;
  explain: () => { plugins: string[]; overrides: string[]; unused: string[] };
};

// illustrative: a recipe-specific runtime can refine resume input via the recipe contract
type ResumableWorkflowRuntime<N extends RecipeName> = WorkflowRuntime<
  RunInputOf<N>,
  ArtefactOf<N>
> & {
  resume: (
    token: ResumeToken,
    resumeInput: ResumeInputOf<N>,
    runtime?: Runtime,
  ) => MaybePromise<Outcome<ArtefactOf<N>>>;
};

// Recipe contracts drive inference. User code does not supply generics;
// the `name` literal selects the contract.
type RecipeContracts = {
  // illustrative only — recipes fill these in
  agent: { input: AgentInput; artefact: AgentArtefact; resumeInput?: AgentResumeInput };
  rag: { input: RagInput; artefact: RagArtefact; resumeInput?: never };
  "hitl-gate": {
    input: HitlGateInput;
    artefact: HitlGateArtefact;
    resumeInput: HitlGateResumeInput;
  };
};

type RecipeName = keyof RecipeContracts;
type RunInputOf<N extends RecipeName> = RecipeContracts[N]["input"];
type ArtefactOf<N extends RecipeName> = RecipeContracts[N]["artefact"];
type ResumeInputOf<N extends RecipeName> = RecipeContracts[N] extends { resumeInput: infer H }
  ? H
  : unknown;

declare const Workflow: {
  recipe: <N extends RecipeName>(name: N) => WorkflowBuilder<RunInputOf<N>, ArtefactOf<N>>;
};

type WorkflowBuilder<TRunInput, TArtefact> = {
  use: (plugin: Plugin) => WorkflowBuilder<TRunInput, TArtefact>;
  build: () => WorkflowRuntime<TRunInput, TArtefact>;
};

// Plugins are opaque at the surface; types are inferred from the recipe contract.
type Plugin = {
  key: string;
  mode?: "extend" | "override";
  capabilities?: CapabilityMap;
  requires?: Array<keyof CapabilityMap>;
  emits?: string[];
};
```

Design constraint: no user-facing generics outside `Workflow.recipe(...)`.
Internally, map plugins to pipeline helpers/extensions and infer types from the recipe.

Internal typing (illustrative):

```ts
type RecipeContracts = {
  agent: { input: AgentInput; artefact: AgentArtefact; resumeInput?: AgentResumeInput };
  rag: { input: RagInput; artefact: RagArtefact; resumeInput?: never };
  "hitl-gate": {
    input: HitlGateInput;
    artefact: HitlGateArtefact;
    resumeInput: HitlGateResumeInput;
  };
};

type RecipeName = keyof RecipeContracts;
type RunInputOf<N extends RecipeName> = RecipeContracts[N]["input"];
type ArtefactOf<N extends RecipeName> = RecipeContracts[N]["artefact"];
type ResumeInputOf<N extends RecipeName> = RecipeContracts[N] extends { resumeInput: infer H }
  ? H
  : unknown;
```

## Examples (End-to-End)

### Tool-Calling Agent

```ts
const wf = Workflow.recipe("agent")
  .use(Model.openai({ model: "gpt-4.1" }))
  .use(Tools.web())
  .use(Trace.console())
  .build();

const out = await wf.run({ input: "Find the latest Node LTS and summarize." });
if (out.status !== "ok") return out;
```

### RAG With Citations

```ts
const wf = Workflow.recipe("rag")
  .use(Retriever.vector({ store: "docs" }))
  .use(Model.openai({ model: "gpt-4.1" }))
  .use(Trace.console())
  .build();

const out = await wf.run({ input: "Explain our refund policy with citations." });
if (out.status !== "ok") return out;
```

### HITL Gate (paused)

```ts
const wf = Workflow.recipe("hitl-gate")
  .use(Model.openai({ model: "gpt-4.1" }))
  .use(Evals.confidence())
  .use(Trace.console())
  .build();

const out = await wf.run({ input: "Approve $5000 spend?" });
if (out.status === "paused") {
  const resumed = await wf.resume(out.token, { decision: "deny" });
  // resume relies on runtime.resume to translate the token + human input
}
```

Outcome and observability are always present:

```ts
if (out.status === "ok") {
  return out.artefact.Answer;
}

out.trace;
out.diagnostics;
```
