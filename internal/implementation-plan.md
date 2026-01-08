# Implementation Plan (Workflow Runtime)

Purpose: detailed, staged plan with pipeline API anchors and mandatory doc updates at each stage.
Guardrails: return early, minimal nesting, each module/test under 500 SLOC, readable by default.

Related docs:

- `docs/workflow-notes.md` (canonical overview)
- `docs/recipes-and-plugins.md` (catalogue)
- `docs/adapters-api.md` (adapter contracts + helpers)

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

## Pseudo Modules

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

- `.resume(token, resumeInput?, runtime?)` for HITL recipes (uses `runtime.resume.resolve`)
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

Context: Implemented the core `Adapter` pattern that maps external constructs (models, tools) into pipeline-compatible extensions and helpers.

## Stage 3 — Runtime + Outcome + Diagnostics

Status: completed. See `docs/stage-3.md` for the detailed checklist.
Note: explain() + contract() were completed as part of Stage 3.

## Stage 4 — Recipes + Minimum Capabilities

Status: completed. See `docs/stage-4.md` for the detailed checklist.

Context: Defined recipe capabilities and minimum requirements to ensure type-safe and runtime-safe execution of workflows.

## Stage 5 — Recipes + Plugin Catalogue Wiring

Status: completed. See `docs/stage-5.md` for the detailed checklist.

Context: Wired the recipe catalog to the plugin system, enabling seamless discovery and dynamic loading of recipe packs.

## Stage 6 — Tests + SLOC Discipline

Status: completed. See `docs/stage-6.md` for the detailed checklist.

Context: Established testing patterns (unit, integration) and enforced strict SLOC limits to maintain code quality and testability.

## Stage 7 — Interface Discovery (Code + Docs)

Status: completed. See `docs/stage-7.md`.

Docs + code:

- Inventory ecosystem interfaces by construct (documents, messages, tools, model calls, retrieval, tracing, text utils, embeddings, retrievers, rerankers, loaders/transformers).
- Define normalized contracts with examples per ecosystem.
- Define parity test matrix and add interop scaffolding tests.
- Add normalized adapter contracts for discovered constructs.

Exit criteria:

- Stage 7 discovery doc is complete for all constructs (including text utilities).
- Normalisation contracts documented with ecosystem examples.
- Parity/shape tests exist for all constructs with available peers.

## Stage 8 — Interoperability Adapters

Status: completed. See `docs/stage-8.md`.

Code:

- Add an opt-in adapter layer for external ecosystems (e.g., LangChain, LlamaIndex, AI SDK).
- Execute construct-first across ecosystems (implement each construct for all ecosystems in parallel).
- Focus on narrow boundary translation (inputs/outputs, tool calls, traces/diagnostics) without changing core Workflow DX.
- Keep adapters as separate modules (or packages) so the core stays small and stable.
- Use per-ecosystem subfolders: `src/adapters/langchain/*`, `src/adapters/llamaindex/*`, `src/adapters/ai-sdk/*`.
- Treat external adapter packages as peer dependencies when work begins.
- Revisit monorepo structure when adapters are introduced (to manage peer deps cleanly and avoid core churn).
- Add workflow-side primitives for adapter use (context accessors, capability predicates, adapter validation).

Peer dependency targets (starter list):

- adapter-langchain
  - peers: `@langchain/core`, `@langchain/ollama` (installed)
  - optional peers: `@langchain/textsplitters` (installed), `@langchain/openai`, `@langchain/community`
- adapter-llamaindex
  - peers: `llamaindex`, `openai`, `ollama`
- adapter-ai-sdk
  - peers: `ai`
  - optional peers: `@ai-sdk/openai`, `@ai-sdk/anthropic`, `ollama-ai-provider-v2` (no `@ai-sdk/ollama`)

Docs:

- Add a short note describing what “first-class interoperability” means here (bridge, not reimplementation).
- Document a minimal example that wraps an external chain/index into a Workflow plugin.

Exit criteria:

- One adapter can run end-to-end via a small example without widening core types.
- Workflow contracts/recipes remain the source of truth; adapters translate to/from them.
- Integration tests are organized by construct: `tests/integration/{construct}.{ecosystem}.test.ts`.

## Stage 8b — Model Execution Adapters

Status: completed. See `docs/stage-8b.md`.

Code:

- Add an execution-level adapter (`Model`) that runs a model end-to-end.
- Normalize results (text, messages, tool calls/results, reasoning, usage, metadata) without generics.
- Support schemaed prompts and structured outputs for both JSON Schema and Zod inputs.
- Implement factories per ecosystem: AI SDK, LangChain, LlamaIndex.
- Dogfood tool calls and schemas in integration tests across all ecosystems.

## Stage 9 — Adapter Registry + Primitives

Status: completed. See `docs/stage-9.md`.

Goals:

- Add an internal adapter registry to resolve constructs across providers (override-aware).
- Add adapter-free primitives so workflows can run without external ecosystems.
- Add a construct extension API to register new constructs/providers.
- Route runtime execution through registry for true mix-and-match.
- Provide value-first adapter registration helpers for DX.

## Stage 10 — Adapter Dependency Signals

Status: completed. See `docs/stage-10.md`.

Goals:

- Add adapter-level dependency metadata where a construct has a hard dependency.
- Emit runtime diagnostics for missing adapter dependencies (warn default, error strict).
- Add runtime input diagnostics for missing data at adapter call sites.
- Document dependency expectations per adapter family.

## Stage 10b — Brand + Infra

Status: completed. See `docs/stage-10b.md`.

Goals:

- Rebrand to Geekist and update package scope/repo metadata.
- Add CI + Codecov, docs site deploy, and release workflows.
- Publish docs via VitePress on GitHub Pages.

## Stage 11 — Paused/Resume Mechanics (Internal Driver)

Status: completed. See `internal/stage-11.md`.

Goals:

- Keep the public API as `run()` / `resume()` with `paused` outcomes (no generator surface).
- Add internal `PauseKind` metadata to trace/diagnostics (not a top-level outcome field).
- Pass `pauseKind?: PauseKind` into resume adapters for better resolution logic.
- Introduce an internal driver that can normalize generator yields into outcomes without exposing generators.

## Stage 12 — Cache Adapter & Session Persistence

Status: completed. See `internal/stage-12.md`.

Goals:

- Standardize a `Cache` adapter for TTL-backed ephemeral state.
- Provide `MemoryCache` as a built-in primitive (in-process, best-effort TTL).
- Bridge cache adapters into the resume session store for pluggable persistence.
- Document cache caveats (TTL behavior, serialization limits, token constraints).

## Stage 13 — RAG Write Path + Missing Adapter Constructs

Status: completed. See `internal/stage-13.md`.

Goals:

- Add a vector store write-path adapter (upsert/delete) to enable ingestion pipelines.
- Define namespace/collection semantics and metadata/filter contracts.
- Support batch ingestion with diagnostics for partial failure.
- Validate embedding dimension constraints where possible.

Progress:

- Added `VectorStore` core types + bundle wiring.
- Implemented LangChain + LlamaIndex vector store adapters.
- Added vector store input diagnostics + tests.
- Updated adapter docs with write-path examples.
- Added AI SDK image/speech/transcription adapters with validations + tests.
- Added AI SDK reranker adapter (RerankingModelV3).
- Added LangChain output parser + structured query adapters.
- Added LlamaIndex query engine + response synthesizer adapters.
- Added AI SDK memory + cache adapters and aligned cache behavior.
- Normalized streaming events across AI SDK, LangChain, LlamaIndex.

## Ongoing Constraints

- Prefer early returns and small pure functions.
- Avoid deep nesting by splitting helpers into single-purpose functions.
- Add short, precise comments only for non-obvious logic.
- Update docs in each stage to prevent drift.
- Streaming parity is now normalized; transport resume bridging remains Stage 15.

## Stage 14 — Composable Recipes (Step Packs)

Status: completed. See `internal/stage-14.md`.

Context: Removed pipeline internals from the public API by introducing "Recipe Packs"—composable units of logic with deterministic ordering and clear defaults.

Exit criteria:

- Recipe packs + flows compile to pipeline helpers with deterministic ordering.
- Pack defaults and minimum capabilities are honored.
- Public docs describe the recipe surface without exposing pipeline internals.

## Stage 15 — Interrupt Parity + Rollback Semantics

Status: completed. See `internal/stage-15.md`.

Context: Unified interrupt strategies (pause/resume) and rollback semantics across all adapter ecosystems, enabling robust HITL workflows.

Exit criteria:

- Interrupt/checkpoint/event-stream adapter surfaces are wired across ecosystems.
- Pause/resume uses rollback when interrupt strategy is restart.
- Recipe layer helpers are documented and implemented.

## Stage 16 — Runtime Policy + Legacy Port (llm-core)

Status: planned. See `internal/stage-16.md`.

Context: Porting the legacy `llm-core` logic to the new architecture and enforcing strict runtime policies for production readiness.

## Stage 17 — Docs Snippets + Import Rewrite

Status: completed. See `internal/stage-17.md`.

Context: Standardized documentation code snippets with real, type-checked files and automatic import rewriting for consistent examples.

## Stage 18 — Refactor Resume Mechanics (Updated Pipeline)

Status: completed. See `internal/stage-18.md`.

Context: Refactored resume mechanics to use the updated pipeline version, ensuring robust pause/resume handling for HITL flows and better state management during interruptions.

## Stage 19 — Interaction Core (Pipeline-Backed)

Status: completed. See `internal/stage-19.md`.

Context: Add a runtime-agnostic interaction layer built on the pipeline, with a unified interaction event protocol, projection reducer, and optional EventStream transport for UI adapters.

## Stage 20 — Interaction Sessions (Core)

Status: complete. See `internal/stage-20.md`.

Context: Add a headless session orchestration layer around Interaction Core using a SessionStore adapter and optional SessionPolicy. Core only accepts opaque session IDs and stays `MaybePromise`-native.

## Stage 21 — UI SDK Adapters + Host Glue (Out-of-Core)

Status: complete. See `internal/stage-21.md`.

Context: Add UI SDK adapter bridges (flagship: Vercel AI SDK) and host transport glue as separate packages, keeping core headless and UI-agnostic. AI SDK UI streaming adapters, assistant-ui commands, and ChatKit events are in place, along with host glue examples and a reference app.
