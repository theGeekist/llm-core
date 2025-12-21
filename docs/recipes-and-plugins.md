# Recipe Contracts + Plugin Catalogue (Draft)

Companion to `docs/workflow-notes.md`. This file is a focused catalogue.

## Recipe Contract Template

Each recipe contract declares:

- **Input**: the single run input shape.
- **Outcome**: `ok | needsHuman | error` (recipes may omit `needsHuman` if they never pause).
- **Artefact map**: canonical artefact keys for this recipe. Keys are stable; plugins may enrich with additional keys.
- **Minimum capabilities**: what must be installed for the recipe to run.
- **Default plugin set**: the baseline “batteries included” configuration.
- **Extension points**: named in recipe terms (mapped internally to lifecycles).

Artefact naming note (illustrative): prefer stable, schema-like keys (e.g. `plan`, `tool.calls`, `retrieval.set`, `answer.text`, `answer.confidence`).

Defaults are installed automatically for each recipe. You can extend or override them via `.use(...)`.

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
  - ok | needsHuman | error
- Minimum capabilities
  - Model
  - Tools (at least one tool)
- Default plugin set (illustrative)
  - Model.openai
  - Tools.web
  - Trace.console
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
  - Retriever (vector store)
  - Embedder (model or embedding provider)
- Default plugin set (illustrative)
  - Retriever.vector
  - Model.embedder
  - Trace.console
- Extension points
  - beforeChunk
  - afterUpsert

### 3) RAG With Citations (Retrieve → Rerank → Cite → Answer)

- Inputs
  - RagInput: { input: string; query?: string; topK?: number }
- Artefact map (canonical keys)
  - `retrieval.query`
  - `retrieval.set`
  - `retrieval.reranked`
  - `citations`
  - `answer.text`
  - `answer.confidence`
- Outcomes
  - ok | needsHuman | error
- Minimum capabilities
  - Retriever (base retriever)
  - Model (for answer)
- Default plugin set (illustrative)
  - Retriever.vector
  - Retriever.rerank
  - Model.openai
  - Trace.console
- Extension points
  - beforeRetrieve
  - afterRetrieve
  - beforeAnswer

### 4) Evaluation Run

- Inputs
  - EvalInput: { prompt: string; datasetId?: string; candidates?: number }
- Primary artefacts
  - Candidates
  - Scores
  - Winner
  - EvalReport
  - DatasetRows
- Outcomes
  - ok | error
- Minimum capabilities
  - Model (for generation)
  - Evaluator (at least one scorer)
- Default plugin set (illustrative)
  - Model.openai
  - Evals.rubric
  - Trace.console
  - Dataset.emit
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
  - HumanInput
  - FinalAnswer
- Outcomes
  - ok | needsHuman | error
- Minimum capabilities
  - Model
  - Evaluator (confidence or policy gate)
  - HITL adapter (to resume)
- Default plugin set (illustrative)
  - Model.openai
  - Evals.confidence
  - Hitl.pauseResume
  - Trace.console
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
  - ok | needsHuman | error
- Minimum capabilities
  - Inner recipe (agent or tot-step)
  - Model
- Default plugin set (illustrative)
  - Recipe.agent (as inner)
  - Model.openai
  - Trace.console

Notes:

- A loop recipe wraps a deterministic inner workflow per iteration; the controller decides continue/stop based on artefacts + budget.
- `needsHuman` may bubble up mid-loop; the outcome should include the partial artefact snapshot and a resume token.

- Extension points
  - beforeIteration
  - afterIteration
  - beforeTerminate

Defaults vs overrides:

```ts
const wf = Workflow.recipe("agent")
  .use({ key: "model.openai.override", mode: "override", overrideKey: "model.openai" })
  .build();
```

## Plugin Catalogue (10–12)

Grouped by capability. Plugins are composable and may extend or override behaviour.

### Model

- Model.openai
  - Provides: model capability, default prompt formatting
  - Emits: Answer, Confidence
- Model.anthropic
  - Provides: model capability, alternative prompt formatting
  - Emits: Answer, Confidence
- Model.embedder
  - Provides: embedding capability
  - Emits: `ingest.embeddings`

### Tools

- Tools.web
  - Provides: tool capability
  - Tool ids: `web.search`, `web.fetch`
  - Emits: `tool.calls`, `tool.results`
- Tools.code
  - Provides: tool capability
  - Tool ids: `code.run`, `code.lint`
  - Emits: `tool.calls`, `tool.results`

### Retriever

- Retriever.vector
  - Provides: base retriever capability (vector store)
  - Emits: `retrieval.set`, `citations`
- Retriever.hybrid
  - Provides: base retriever capability (keyword + vector)
  - Emits: `retrieval.set`, `citations`
- Retriever.rerank
  - Provides: reranking capability
  - Emits: `retrieval.reranked`

### Memory

- Memory.threadSummary
  - Provides: memory capability
  - Emits: `memory.summary`

### Evaluator

- Evals.rubric
  - Provides: evaluator capability (rubric scoring)
  - Emits: `eval.scores`, `eval.report`
- Evals.confidence
  - Provides: evaluator capability (confidence thresholds)
  - Emits: `answer.confidence`, `gate.decision`
- Evals.citations
  - Provides: evaluator capability (citation presence/coverage)
  - Emits: `eval.scores`
- Evals.factuality
  - Provides: evaluator capability (tool-backed or judge-backed factuality)
  - Emits: `eval.scores`

### Trace

- Trace.console
  - Provides: trace capability (console sink)
  - Emits: `trace.events`
- Trace.persist
  - Provides: trace capability (storage sink)
  - Emits: `trace.events`

### Dataset

- Dataset.emit
  - Provides: dataset emission capability (rows + storage adapter)
  - Emits: `dataset.rows`

### HITL

- Hitl.pauseResume
  - Provides: HITL adapter
  - Emits: `hitl.token`, `hitl.packet`

## Conflict Scenarios + explain()

`explain()` is illustrative and focuses on composition truth:

- `overrides`: resolved deterministic overrides (what replaced what).
- `unused`: registrations that were installed but did not participate (e.g., shadowed by override, duplicate key in extend mode).
- `missingRequirements`: plugins that are blocked due to missing required capabilities.

### Conflict 1: Model override shadowing

- Scenario: two model plugins installed, one overrides the other.
  - `.use(Model.openai({ ... }))`
  - `.use(Model.anthropic({ mode: "override" }))`
- explain() (illustrative)

```ts
{
  plugins: ["model.openai", "model.anthropic"],
  overrides: ["model.anthropic overrides model.openai"],
  unused: []
}
```

### Conflict 2: Retriever missing dependency

- Scenario: RAG recipe uses `Retriever.rerank` but no base retriever installed.
  - `.use(Retriever.rerank())`
- explain() (illustrative)

```ts
{
  plugins: ["retriever.rerank"],
  overrides: [],
  unused: [],
  missingRequirements: ["retriever.rerank (requires base retriever: retriever.vector or retriever.hybrid)"]
}
```

### Conflict 3: Duplicate tool registrations (extend mode)

- Scenario: two tool plugins register the same tool id in extend mode.
  - `.use(Tools.web({ toolId: "web.search" }))`
  - `.use(Tools.web({ toolId: "web.search" }))`
- explain() (illustrative)

```ts
{
  plugins: ["tools.web#1", "tools.web#2"],
  overrides: [],
  unused: ["tools.web#2 (duplicate tool id: web.search)"]
}
```
