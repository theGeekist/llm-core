# v2 docs: structure and content plan

Companion to `V2-IA.md`. Page-by-page migration map for review. Nothing is
written to published pages until the structure is signed off.

Principle: keep the v1 voice, retell with the ratified nouns, organise by the
dependency direction the code enforces. But the nouns are **not**
interchangeable. The first draft flattened distinct concepts into single
substitutions; this revision fixes that against ADR-002, ADR-006 and the
research assessment.

## The mental model (authoritative)

> Specs describe agents. Recipes package workflows. Runners execute agent runs.
> Workflows orchestrate steps. Interactions project events into UI state.
> Capabilities define ports; adapters plug into them.

Noun rules the docs must hold to:

| Concept | Rule |
|---|---|
| `AgentSpec` | Description of a probabilistic agent. Not a Recipe, not a Workflow. (`AgentDefinition` -> `AgentSpec`.) |
| `AgentRunner` | The port that executes a spec. Local impl `createLocalAgentRunner`. (`AgentRuntime` -> `AgentRunner`.) |
| `AgentRun` | The live handle: events + typed controls. Terminates once in a `RunResult`. |
| `RunResult` | Terminal agent result: `completed \| failed \| denied \| cancelled`. Not `Outcome`. |
| `Workflow` | Explicit orchestration of `Step`s. Kept. |
| `Recipe` | Reusable, preconfigured `Workflow` composition. Kept. Must document how it differs from Workflow/AgentSpec/template. |
| `Step` | Author-defined workflow unit. Kept. |
| `Outcome<T>` | Workflow execution union `ok \| paused \| error`. Kept. Not `RunResult`. |
| Suspension | An `InterventionRequest` + a `ResumableCheckpoint` + a `ResumeStrategy`. A control, not a terminal result. |
| `Pack` | Weakest noun. Rename to `RecipeModule`/`StepGroup` or drop from public vocabulary. |
| `Artifact` | Kept; American spelling `artifact` in code/fields. |

## Disposition codes

- **RETELL** keep the page and its prose, swap the drifted nouns, same purpose.
- **KEEP** publish unchanged; no content edit needed.
- **NEW** net-new page with no v1 source.
- **SPLIT** divide one v1 page into multiple v2 pages.
- **MERGE** fold into another page.
- **MOVE** same content, new home in the tree.
- **P1** deferred until the matching P1 feature slice ships.
- **RETIRE** drop from the public site (internal or obsolete).

## Two gates, not one

1. **Conceptual gate.** Prose that uses the ratified nouns is safe now, because
   ADR-002 and ADR-006 are accepted and authoritative unless superseded. Concept pages (Why, Core
   concepts, Vocabulary) clear this gate today.
2. **Surface gate.** Any import path, function name, type shape, or lifecycle
   claim must match a real exported surface. Check
   `packages/llm-core/package.json` `exports` before writing code. Today that is
   `/`, `/workflow`, `/recipes`, `/interaction`, `/functional`, `/diagnostics`,
   `/adapters/*`. The capability subpaths (`/agent`, `/model`, `/control`,
   `/evidence`, `/state`, `/tools`) are **not exported yet**; the integration
   owner wires them at convergence (P0-150). A page needing an unshipped surface
   stays conceptual (or `status: draft`) until then.

Consequence: no v2 capability page can carry runnable code today. The near-term
work is the three concept pages plus RETELL of prose that does not assert code.

## Proposed top-level structure

Nav: **Guide · Capabilities · Orchestration · Interaction · Adapters ·
Reference**. Recipes stop being the headline metaphor; they live in the
Orchestration Cookbook.

## Section 1 — Guide

| v1 page | Disposition | v2 home | Noun changes | Gate |
|---|---|---|---|---|
| `guide/philosophy.md` | RETELL | Guide / Why llm-core | keep Recipe; agent unit is `AgentSpec`; `Outcome` kept; reword "unleashed" | concept |
| `guide/core-concepts.md` | RETELL (major) | Guide / Core concepts | 4 principles reframed (below) | concept |
| `guide/hello-world.md` | RETELL (one page) | Guide / Get started | smallest real agent run is the definition of "get started"; RAG+HITL demoted to later sections/Cookbook | agent surface (code) |
| `guide/interaction-single-turn.md` | RETELL | Guide / Single-turn interaction | align event names | interaction surface |
| `guide/interaction-sessions.md` | RETELL | Guide / Sessions + transport | keep | interaction surface |
| `guide/socket-server.md` | RETELL | Guide / Socket server | keep | interaction surface |
| `guide/end-to-end-ui.md` | RETELL | Guide / End-to-end UI | keep | interaction + ai-sdk |
| `guide/composing-recipes.md` | MOVE + RETELL | Orchestration / Composing workflows | Packs -> RecipeModule/StepGroup or drop | workflow surface |
| `guide/debugging.md` | MERGE | Capabilities / Evidence + short Guide / Debugging | trace -> `ExecutionEvent` stream | evidence surface |
| `guide/media-inputs.md` | RETELL (P1) | Capabilities / Media | keep | no task yet (TBD) |
| `guide/advanced-features.md` | SPLIT | Capabilities / Control + Capabilities / State | policy/approval/intervention; pause -> checkpoint | control + state |

Core-concepts reframing (the 4 principles):
1. "Recipes are assets" -> **Descriptions are data.** Two distinct kinds: an
   `AgentSpec` (agent) and a `Workflow`/`Recipe` (orchestration). Do not merge.
2. "Adapters are plugs" -> **kept, corrected.** Capabilities are ports; adapters
   plug in. (v1 wrongly called adapters the ports.)
3. "Interactions are projections" -> **kept.** Align event names.
4. "Steps are uniform / MaybePromise" -> **kept.**
   The run-conclusion section documents **two** types: `Outcome<T>` for
   workflows, and a live `AgentRun` ending in one terminal `RunResult` for agents.

## Section 2 — Capabilities (the v2 spine)

One page per feature front. All are surface-gated (no code until exported).

| v2 page | Disposition | v1 source | Core nouns | Gate (task) |
|---|---|---|---|---|
| Contracts and portability | NEW | — | identity, invocation, versioning, JSON-portability | P0-100 |
| Model and profiles | RETELL | `adapters/models.md` | ModelRequest/Response, ModelProfile | P0-120 |
| Tools and schemas | RETELL | `adapters/tools.md` | ToolSpec, ToolCall, ToolResult, ToolExecutionReceipt | P0-110 |
| Control: policy, approval, intervention | NEW | `advanced-features.md`, `recipes/hitl.md` | PolicyDecision, ApprovalRequest, InterventionRequest, ResumeStrategy | P0-110 + P0-130 |
| Evidence: events and usage | NEW | `guide/debugging.md`, `adapters/observability.md` | ExecutionEvent, EventSink | P0-110 |
| State and durability | NEW | `core-concepts.md` (pause), `hitl.md` | LiveContinuation, Snapshot, ResumableCheckpoint, DurableExecutionHandle | P0-130 |
| Agents | RETELL | `recipes/agent.md` | AgentSpec, AgentRunner, AgentRun, RunResult | P0-140 |
| Retrieval | RETELL (P1) | `adapters/retrieval.md` | — | no task yet (TBD) |
| Storage and memory | RETELL (P1) | `adapters/storage.md` | — | no task yet (TBD) |
| Media | RETELL (P1) | `guide/media-inputs.md` | — | no task yet (TBD) |
| Context | NEW (P1) | — | context items/manifest | P1-210 |
| Artifacts | NEW (P1) | — | Artifact, provenance | P1-210 |
| Evaluation | NEW (P1) | `recipes/eval.md` | Evaluation domain | P1-220 |

Retrieval, Storage/memory and Media have **no implementation task** in the
programme yet. They stay on the map but are not scheduled; revisit when a task
is created. Context/Artifacts (P1-210) and Evaluation (P1-220) are distinct
pages, one per domain, per the one-page-per-front rule.

## Section 3 — Orchestration (application layer)

| v2 page | Disposition | v1 source | Notes |
|---|---|---|---|
| Workflows | RETELL | `reference/workflow-api.md`, `reference/composition-model.md` | Pack -> RecipeModule/StepGroup; keep compiler+runtime framing |
| Cookbook overview | RETELL | `recipes/index.md` | recipes = named workflow compositions |
| Simple chat | RETELL | `recipes/simple-chat.md` | preset + base handle |
| RAG | RETELL | `recipes/rag.md` | retrieval + synthesis |
| HITL | RETELL | `recipes/hitl.md` | references Control + State pages |
| Ingest | RETELL | `recipes/ingest.md` | ETL for RAG |
| Loop | RETELL | `recipes/loop.md` | iterate + terminate |
| Eval | RETELL (P1) | `recipes/eval.md` | ties to Evaluation capability |
| Compress | RETELL | `recipes/compress.md` | summarise |
| Tool execution | NEW | — | policy -> approval -> execution -> receipt as one path |

Tool execution is an **Orchestration** page (application/tool-execution), not a
Capability. It is counted once, here.

## Section 4 — Interaction

| v1 page | Disposition | v2 home |
|---|---|---|
| `interaction/index.md` (core) | RETELL | Interaction / Core |
| `interaction/pipeline.md` (handle) | RETELL | Interaction / Handle |
| `interaction/session.md` | RETELL | Interaction / Sessions |
| `interaction/transport.md` | RETELL | Interaction / Transport |
| `interaction/host-transport.md` | RETELL | Interaction / Host |

Fix in passing: `config.mts` links Host to `/interaction/host-glue`, but the file
is `host-transport.md`. Correct the link during the rebuild.

## Section 5 — Adapters

| v2 page | Disposition | v1 source | Notes |
|---|---|---|---|
| Overview | RETELL | `adapters/index.md` | capabilities-are-ports framing |
| AI SDK | RETELL | `adapters/models.md` (provider parts) | the `/adapters/ai-sdk` surface, P0-160 |
| Frameworks (LangChain, LlamaIndex) | RETELL | `adapters/models.md`, `adapters/retrieval.md` | runtime adapters implement `AgentRunner` |
| Runtimes | NEW | — | `AgentRunner` implementations; second runtime (P1-230) |
| UI SDK | RETELL | `adapters/ui-sdk.md` | AI SDK, assistant-ui, ChatKit |
| Observability | MOVE | `adapters/observability.md` | provider side of Evidence |

## Section 6 — Reference

Reader-facing titles (no internal cadence, per STYLE):

| v2 page | Disposition | v1 source |
|---|---|---|
| API reference by capability | RETELL | `reference/recipes-api.md`, `reference/adapters-api.md`, `reference/workflow-api.md`, `reference/runtime.md` |
| Contracts reference | NEW | — |
| Vocabulary | NEW (drafted) | — |
| Composition model | RETELL | `reference/composition-model.md` |
| Plugins | RETELL | `reference/plugins.md` |
| Packaging and conformance | NEW | — (ESM-only, Node baseline, conformance levels) |
| Design decisions | NEW | curated, reader-facing summary of the accepted decisions (no ADR numbers or internal cadence in prose) |
| Release process | KEEP | `reference/release.md` |
| Interop audit | RETIRE | move `reference/interop-audit.md` to `.internal/` |

## Migration page (mandatory)

NEW `1.x -> 2.0`: the literal rename and import table, filled from accepted ADRs
as each surface exports. Linked from the Guide and the landing page.

## Net-new page count

Capabilities: Contracts, Control, Evidence, State (P0), plus Context, Artifacts,
Evaluation (P1). Orchestration: Tool execution. Adapters: Runtimes. Reference:
Contracts reference, Vocabulary, Packaging/conformance, Design decisions.
Migration: 1. Roughly 15 new pages; the rest are RETELL.

## Sequencing (write order)

1. **Concept batch (now, concept gate):** Landing (done), Why llm-core, Core
   concepts, Vocabulary. No code.
2. **RETELL prose that asserts no code:** overviews and conceptual sections of
   Guide/Adapters/Interaction pages.
3. **Surface-gated pages, as each exports at/after P0-150:** Contracts, Model,
   Tools, Control, Evidence, State, then Agents and Get started.
4. **Interaction + Orchestration** once their surfaces export.
5. **P1:** Context, Artifacts, Evaluation (tasked); Retrieval, Storage/memory,
   Media once tasked.
6. **Migration page** last, once renames are frozen and exported.

## Decisions (locked 29 Jul 2026)

1. **Recipes:** Orchestration **Cookbook**; not the headline metaphor.
2. **Spine section name:** **Capabilities**.
3. **Get started:** `hello-world.md` stays **one page**; its definition is the
   smallest real agent run, with RAG+HITL as progressive "next"/Cookbook.
4. **First draft batch:** the **concept batch** (Why, Core concepts, Vocabulary).
```
