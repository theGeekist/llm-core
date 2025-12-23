# Recipe Contracts + Plugin Catalogue (Draft)

This file is a focused catalogue for recipe contracts + plugin expectations.
Adapter contracts live in `docs/adapters-api.md`.

## Recipe Contract Template

Each recipe contract declares:

- **Input**: the single run input shape.
- **Outcome**: `ok | paused | error` (recipes may omit `paused` if they never pause).
- **Artefact map**: canonical artefact keys for this recipe. Keys are stable; plugins may enrich with additional keys.
- **Minimum capabilities**: what must be installed for the recipe to run.
- **Default plugin set**: the baseline “batteries included” configuration.
- **Extension points**: named in recipe terms (mapped internally to lifecycles).

Artefact naming note (illustrative): prefer stable, schema-like keys (e.g. `plan`, `tool.calls`, `retrieval.set`, `answer.text`, `answer.confidence`).

Defaults are installed automatically for each recipe. You can extend or override them via `.use(...)`.

## Adapter helpers (DX path)

Adapters can be registered with value-first helpers and used like any plugin:

::: tabs
== TypeScript

```ts
import { Adapter } from "#adapters";
import { Workflow } from "#workflow";

const wf = Workflow.recipe("rag")
  .use(
    Adapter.retriever("custom.retriever", {
      retrieve: () => ({ documents: [] }),
    }),
  )
  .build();
```

== JavaScript

```js
import { Adapter } from "#adapters";
import { Workflow } from "#workflow";

const wf = Workflow.recipe("rag")
  .use(
    Adapter.retriever("custom.retriever", {
      retrieve: () => ({ documents: [] }),
    }),
  )
  .build();
```

:::

## Starter Recipes (6)

### 1) Tool-Calling Agent

- Inputs
  - AgentInput: { input: string; context?: string }
- Primary artefacts
  - Plan
  - ToolCall[]
  - ToolResult[]
  - Answer
  - Confidence
- Outcomes
  - ok | paused | error
- Minimum capabilities
  - `model`
  - `tools`
- Default plugin set (illustrative)
  - `model.openai`
  - `tools.web`
  - `trace.console`
- Extension points
  - beforePlan
  - afterToolExec
  - beforeAnswer

### 2) Ingest (Chunk → Embed → Upsert)

- Inputs
  - IngestInput: { sourceId: string; documents: Array<{ id: string; text: string }>; chunking?: "default" | "byHeading" }
- Artefact map (canonical keys)
  - `ingest.chunks`
  - `ingest.embeddings`
  - `ingest.upserted`
- Outcomes
  - ok | error
- Minimum capabilities
  - `retriever`
  - `embedder`
- Default plugin set (illustrative)
  - `retriever.vector`
  - `model.embedder`
  - `trace.console`
- Extension points
  - beforeChunk
  - afterUpsert

### 3) RAG With Citations (Retrieve → Rerank → Cite → Answer)

- Inputs
  - `RagInput`
    - `input: string`
    - `query?: string`
    - `topK?: number`
- Artefact map (canonical keys)
  - `retrieval.query`
  - `retrieval.set`
  - `retrieval.reranked`
  - `citations`
  - `answer.text`
  - `answer.confidence`
- Outcomes
  - ok | paused | error
- Minimum capabilities
  - `retriever`
  - `model`
- Default plugin set (illustrative)
  - `retriever.vector`
  - `retriever.rerank`
  - `model.openai`
  - `trace.console`

Note: `retriever.rerank` is an add-on; it assumes a base retriever is present and does not replace it.

- Extension points
  - beforeRetrieve
  - afterRetrieve
  - beforeAnswer

### 4) Evaluation Run

- Inputs
  - `EvalInput`
    - `prompt: string`
    - `datasetId?: string`
    - `candidates?: number`
- Primary artefacts
  - Candidates
  - Scores
  - Winner
  - EvalReport
  - DatasetRows
- Outcomes
  - ok | error
- Minimum capabilities
  - `model`
  - `evaluator`
- Default plugin set (illustrative)
  - `model.openai`
  - `evals.rubric`
  - `trace.console`
  - `dataset.emit`
- Extension points
  - beforeGenerate
  - afterScore
  - beforeReport

### 5) HITL Gate

- Inputs
  - HitlGateInput: { input: string; policy?: string }
- Primary artefacts
  - DraftAnswer
  - Confidence
  - GateDecision
  - ResumeInput
  - FinalAnswer
- Outcomes
  - ok | paused | error
- Minimum capabilities
  - `model`
  - `evaluator`
  - `hitl`
- Default plugin set (illustrative)
  - `model.openai`
  - `evals.confidence`
  - `hitl.pauseResume`
  - `trace.console`
- Extension points
  - beforeGate
  - afterGate
  - beforeFinalize

### 6) Loop Recipe (Agent/ToT)

- Inputs
  - LoopInput: { input: string; maxIterations?: number }
- Artefact map (canonical keys)
  - `loop.iterations`
  - `loop.result`
  - `loop.terminationReason`
- Outcomes
  - ok | paused | error
- Minimum capabilities
  - `recipe`
  - `model`
- Default plugin set (illustrative)
  - `recipe.agent`
  - `model.openai`
  - `trace.console`

Notes:

- A loop recipe wraps a deterministic inner workflow per iteration; the controller decides continue/stop based on artefacts + budget.
- `paused` may bubble up mid-loop; the outcome should include the partial artefact snapshot and a resume token.

- Extension points
  - beforeIteration
  - afterIteration
  - beforeTerminate

Defaults vs overrides:

::: tabs
== TypeScript

```ts
const wf = Workflow.recipe("agent")
  .use({ key: "model.openai.override", mode: "override", overrideKey: "model.openai" })
  .build();
```

== JavaScript

```js
const wf = Workflow.recipe("agent")
  .use({ key: "model.openai.override", mode: "override", overrideKey: "model.openai" })
  .build();
```

:::

## Plugin Catalogue (10–12)

Grouped by capability. Plugins are composable and may extend or override behaviour.

### Model

- `model.openai` (friendly: Model.openai)
  - Provides: `model` capability, default prompt formatting
  - Emits: Answer, Confidence
- `model.anthropic` (friendly: Model.anthropic)
  - Provides: `model` capability, alternative prompt formatting
  - Emits: Answer, Confidence
- `model.embedder` (friendly: Model.embedder)
  - Provides: `embedder` capability
  - Emits: `ingest.embeddings`

### Tools

- `tools.web` (friendly: Tools.web)
  - Provides: `tools` capability
  - Tool ids: `web.search`, `web.fetch`
  - Emits: `tool.calls`, `tool.results`
- `tools.code` (friendly: Tools.code)
  - Provides: `tools` capability
  - Tool ids: `code.run`, `code.lint`
  - Emits: `tool.calls`, `tool.results`

### Retriever

Note: `retriever` is treated as a single capability in code. Defaults treat `retriever.vector` as
the base retriever; `retriever.rerank` is an add-on and does not provide `retriever` capability.

- `retriever.vector` (friendly: Retriever.vector)
  - Provides: `retriever` capability (base vector store)
  - Emits: `retrieval.set`, `citations`
- `retriever.hybrid` (friendly: Retriever.hybrid)
  - Provides: `retriever` capability (keyword + vector)
  - Emits: `retrieval.set`, `citations`
- `retriever.rerank` (friendly: Retriever.rerank)
  - Provides: `retrieval.reranked` artefact output; requires retriever; no `retriever` capability
  - Emits: `retrieval.reranked`

### Memory

- `memory.threadSummary` (friendly: Memory.threadSummary)
  - Provides: `memory` capability
  - Emits: `memory.summary`

### Evaluator

- `evals.rubric` (friendly: Evals.rubric)
  - Provides: `evaluator` capability (rubric scoring)
  - Emits: `eval.scores`, `eval.report`
- `evals.confidence` (friendly: Evals.confidence)
  - Provides: `evaluator` capability (confidence thresholds)
  - Emits: `answer.confidence`, `gate.decision`
- `evals.citations` (friendly: Evals.citations)
  - Provides: `evaluator` capability (citation presence/coverage)
  - Emits: `eval.scores`
- `evals.factuality` (friendly: Evals.factuality)
  - Provides: `evaluator` capability (tool-backed or judge-backed factuality)
  - Emits: `eval.scores`

### Trace

- `trace.console` (friendly: Trace.console)
  - Provides: `trace` capability (console sink)
  - Emits: `trace.events`
- `trace.persist` (friendly: Trace.persist)
  - Provides: `trace` capability (storage sink)
  - Emits: `trace.events`

### Dataset

- `dataset.emit` (friendly: Dataset.emit)
  - Provides: `dataset` capability (rows + storage adapter)
  - Emits: `dataset.rows`

### HITL

- `hitl.pauseResume` (friendly: Hitl.pauseResume)
  - Provides: `hitl` capability (adapter)
  - Emits: `hitl.token`, `hitl.packet`
  - Resume relies on `runtime.resume.resolve(...)` to continue after `paused`

## Conflict Scenarios + explain()

`explain()` is illustrative and focuses on composition truth:

- `overrides`: resolved deterministic overrides (what replaced what).
- `unused`: registrations that were installed but did not participate (e.g., shadowed by override, duplicate key in extend mode).
- `missingRequirements`: plugins that are blocked due to missing required capabilities.

### Conflict 1: Model override shadowing

- Scenario: two model plugins installed, one overrides the other.
  - `.use({ key: "model.openai" })`
  - `.use({ key: "model.anthropic", mode: "override", overrideKey: "model.openai" })`
- explain() (illustrative)

::: tabs
== TypeScript

```ts
{
  plugins: ["model.openai", "model.anthropic"],
  overrides: ["model.anthropic overrides model.openai"],
  unused: []
}
```

== JavaScript

```js
{
  plugins: ["model.openai", "model.anthropic"],
  overrides: ["model.anthropic overrides model.openai"],
  unused: []
}
```

:::

### Conflict 2: Retriever missing dependency

- Scenario: RAG recipe uses `retriever.rerank` but no base retriever installed.
  - `.use({ key: "retriever.rerank", requires: ["retriever"] })`
- explain() (illustrative)

::: tabs
== TypeScript

```ts
{
  plugins: ["retriever.rerank"],
  overrides: [],
  unused: [],
  missingRequirements: ["retriever.rerank (requires retriever)"]
}
```

== JavaScript

```js
{
  plugins: ["retriever.rerank"],
  overrides: [],
  unused: [],
  missingRequirements: ["retriever.rerank (requires retriever)"]
}
```

:::

### Conflict 3: Duplicate tool registrations (extend mode)

- Scenario: two tool plugins register the same tool id in extend mode.
  - `.use({ key: "tools.web" })`
  - `.use({ key: "tools.web" })`
- explain() (illustrative)

::: tabs
== TypeScript

```ts
{
  plugins: ["tools.web#1", "tools.web#2"],
  overrides: [],
  unused: ["tools.web#2 (duplicate tool id: web.search)"]
}
```

== JavaScript

```js
{
  plugins: ["tools.web#1", "tools.web#2"],
  overrides: [],
  unused: ["tools.web#2 (duplicate tool id: web.search)"]
}
```

:::
