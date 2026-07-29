# v2 docs: information architecture

Working map for the v2 rebuild. v1 is frozen on branch `docs-1.x`
(snapshot `0156181`); this tree becomes v2. Structure follows the arch
topology so pages stay aligned with code: one docs section per public front in
`packages/llm-core/internal/final-architecture/PLAN.md`.

## Principle

The v1 IA was organised by metaphor ("Recipes are Assets", "Adapters are
Plugs"). v2 is organised by the dependency direction the code enforces:

```
contracts  ->  feature public fronts  ->  application  ->  adapters / delivery
```

A reader walks the sidebar top to bottom and meets each primitive in the order
it depends on the ones above it.

## Sidebar map (front to docs section)

| Public front | Docs section | Core nouns |
|---|---|---|
| (none) | **Get started**: install, first `AgentRun`, mental model | (none) |
| `/contracts` | **Contracts and portability** | identity, invocation, versioning, JSON-portability invariant |
| `/model` | **Model and profiles** | `ModelRequest`, `ModelResponse`, `ModelProfile` |
| `/tools` | **Tools and schemas** | `ToolSpec`, `ToolCall`, `ToolResult`, `ToolExecutionReceipt` |
| `/control` | **Control: policy, approval, intervention** | `PolicyDecision`, `ApprovalRequest`, `InterventionRequest`, `ResumeStrategy` |
| `/evidence` | **Evidence: events and usage** | `ExecutionEvent`, `EventSink` (redaction, projection) |
| `/state` | **State and durability** | `LiveContinuation`, `Snapshot`, `ResumableCheckpoint`, `DurableExecutionHandle` |
| `/agent` | **Agents** | `AgentSpec`, `AgentRunner`, `AgentRun`, `RunResult` |
| `/workflow` | **Orchestration** (application) | recipes, tool-execution, capability bindings |
| `/interaction` | **Interaction and sessions** | reducers, sessions, UI projections, host transport |
| `/adapters/ai-sdk` | **Adapters** | providers, frameworks (AI SDK 7), runtimes, UI |
| (none) | **Reference**: API reference by capability, contracts, vocabulary, design decisions, packaging/conformance, release | (none) |
| (none) | **Migration: v1 to v2** | vocabulary and import map | (none) |

P1 features (`retrieval`, `indexing`, `storage`, `memory`, `media`, `context`,
`artifacts`, `evaluation`) get sections as their slices land, so the docs cover
shipped surface only.

## Migration page is mandatory

v2 replaces the public API directly (pre-compatibility posture), so the v1-to-v2
page carries a literal rename and import table, for example:

| v1 | v2 |
|---|---|
| `AgentDefinition` | `AgentSpec` |
| `AgentRuntime` / `createAgentRuntime` | `AgentRunner` / `createLocalAgentRunner` |
| `fromAiSdkModel(openai("gpt-4o"))` | `@geekist/llm-core/adapters/ai-sdk`, resolved via `ModelProfile` |
| `result.artefact` | `artifact` on the `Outcome` (workflow) or `RunResult` (agent) |

`Recipe`, `Workflow`, `Step` and `Outcome` are retained, so `/recipes`,
`/workflow` and `/interaction` keep their names. The renames above are the
breaking ones.

Each row is filled from the accepted ADRs as its slice converges, so the table
reflects the real API rather than a guess.

## Build constraints

- Every documented import resolves to a real public subpath export.
- Concept pages carry a snippet in `docs/snippets/` (typechecked) once the
  matching slice ships. Before that, use inline fenced examples (not typechecked)
  and mark the page `status: draft` in frontmatter.
- Sidebar and nav edits live in `docs/.vitepress/config.mts`.

## Sequencing

Follow the arch waves. A front's docs are written after its ADR is accepted and
its slice passes, so copy describes a frozen surface. Order: contracts, then
model/tools/control/evidence/state, then agent, then application, then adapters,
then interaction.
