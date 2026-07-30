# v2 documentation content ledger

The Architecture v2 implementation is complete. This ledger tracks published
documentation against the shipped 19-front, ESM-only package surface.

## Authoritative package model

- The root exports local agent composition.
- Independent capability subpaths cover contracts, model, tools, control,
  evidence, state, context, artifacts, and evaluation.
- `/agent` curates agent execution, capability bindings, retrieval, indexing,
  storage, and memory.
- `/workflow` owns ordered workflow orchestration and controlled resume.
- `/interaction` owns sessions, canonical event reduction, and projection.
- Qualified adapter subpaths cover AI SDK model integration and four UI
  projection targets.
- There is no public `/recipes` or `/diagnostics` export.

## Work sections

| Section                    | Source pages                                                                                         | Required outcome                                                               |
| -------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Guide                      | landing and `guide/*`                                                                                | Accurate mental model and task-led walkthroughs.                               |
| Core capabilities          | contracts, model, tools, control, evidence, state                                                    | One focused page per guarantee-bearing public capability.                      |
| Agent-owned and P1 domains | bindings, retrieval/indexing, storage/memory, context, artifacts, evaluation                         | Explain ownership, portability, and composition without inventing subpaths.    |
| Orchestration              | workflow and controlled execution                                                                    | Separate passive workflow execution from durable controlled effects.           |
| Interaction and adapters   | interaction and qualified adapter pages                                                              | Explain event projection, session ownership, redaction, and native boundaries. |
| Reference                  | vocabulary, API, functional helpers, failures, exports, contracts, conformance, decisions, migration | Exact names and mappings with no tutorial duplication.                         |

## Completed snippet inventory

Every V2 snippet exists, typechecks, and is embedded by a published page:

- [x] `agent-capabilities.ts`
- [x] `agent-skills.ts`
- [x] `artifact-provenance.ts`
- [x] `capability-bindings.ts`
- [x] `capability-invocation-retry.ts`
- [x] `context-manifest.ts`
- [x] `contracts-portability.ts`
- [x] `control-policy.ts`
- [x] `controlled-tool-execution.ts`
- [x] `evaluation-composition.ts`
- [x] `evidence-redaction.ts`
- [x] `interaction-events.ts`
- [x] `interaction-projection.ts`
- [x] `interaction-transport.ts`
- [x] `local-agent.ts`
- [x] `model-media.ts`
- [x] `model-resolution.ts`
- [x] `model-tool-agent.ts`
- [x] `qualified-adapters.ts`
- [x] `retrieval-indexing.ts`
- [x] `state-lifetimes.ts`
- [x] `storage-memory.ts`
- [x] `tool-binding.ts`
- [x] `workflow-composition.ts`
- [x] `workflow-resume.ts`

Every reusable TypeScript example belongs in `docs/snippets/v2/`, passes
`docs:snippets:typecheck`, and is embedded by at least one published page.

## Delivery order

1. Resolve the docs-v2 merge and update the authoring contract.
2. Rewrite Guide and the core mental model.
3. Split and complete capability pages.
4. Add Orchestration.
5. Expand Interaction and Adapters.
6. Complete Reference and migration.
7. Run an independent cross-doc audit for links, nouns, imports, snippets,
   VitePress build output, and Mermaid rendering.

## Completion gates

- Every public package subpath is documented in the API reference.
- Every sidebar link exists.
- Every published import resolves.
- All snippet files typecheck and every snippet is referenced.
- VitePress builds without broken local links.
- Diagrams render and use current exported nouns.
- Published prose contains no task IDs, branch names, architecture programme
  language, or unsupported compatibility claims.
