# ADR-012 — Exact Public Vocabulary and Package Surfaces

Architecture version: v2
Status: proposed
Date: 2026-07-31
Owners: architecture coordinator
Affected tasks: language-vocabulary, language-rollout, specification-contracts
through specification-api, adapter-openspec through adapter-bmad-release
Supersedes: exact public naming clauses in ADR-002, ADR-008 and ADR-009

## Context

ADR-011 established the language levels, naming rules and atomic rollout gate.
It intentionally did not choose exact replacement names. The package currently
publishes 731 compiler-resolved names across 19 entrypoints. Common fronts mix
ready-to-use objects with preparation, registration, binding, provenance,
durability and adapter machinery.

This decision fixes one exact vocabulary before the breaking rollout and before
specification contracts ship.

## Decision

### Common journeys

The package root and matching common fronts use these exact nouns and actions:

| Journey       | Factory/action       | Ready object    | Live/result values                                                      |
| ------------- | -------------------- | --------------- | ----------------------------------------------------------------------- |
| Agent         | `createAgent`        | `Agent`         | `AgentRun`, `AgentEvent`, `AgentResult`                                 |
| Tool          | `defineTool`         | `Tool`          | `ToolCall`, `ToolExecutionResult`, `ToolExecutionFailure`               |
| Workflow      | `defineWorkflow`     | `Workflow`      | `WorkflowStep`, `WorkflowStepResult`, `WorkflowResult`, `WorkflowPause` |
| Conversation  | `createConversation` | `Conversation`  | `ConversationRun`, `ConversationEvent`, `ConversationResult`            |
| Specification | `loadSpecification`  | `Specification` | `SpecificationDecision`, `CompiledSpecification<T>`                     |

Common configuration values are `AgentConfig`, `ToolConfig`,
`WorkflowConfig` and `ConversationConfig`. A ready object owns its ordinary
operations:

- `Agent.run`, `Agent.start`;
- `Workflow.run`, `Workflow.resume`;
- `Conversation.send`, `Conversation.stream`; and
- `compileSpecification` for an accepted `SpecificationDecision`.

Common factories hide identity allocation, invocation contexts, preparation,
schema registration, binding, reservations and authority verification.

### Portable definitions and runtime extension names

A portable authored contract is a `Definition`, never the ready common object:

- `AgentSpec` becomes `AgentDefinition`;
- `PreparedAgentSpec` becomes `PreparedAgentDefinition`;
- `ToolSpec` becomes `ToolDefinition`;
- `defineToolSpec` becomes the runtime-level `defineToolDefinition`.
- the current `ToolBinding` splits into common `Tool` and runtime
  `ExecutableTool`;
- `registerToolSchema` becomes runtime `defineToolSchema`; and
- public `register*` media/model constructors become `create*` operations,
  while registered brands and recognition helpers become internal.

Runtime implementer names are:

- `AgentRunner`, `AgentRunnerProfile`, `AgentStartRequest`,
  `AgentResumeRequest`;
- `ToolExecutionInput`, `ToolExecutionResult`, `ToolExecutionFailure`;
- `ControlledWorkflowStep`, `ControlledWorkflowStepResult`,
  `ControlledWorkflowResult`; and
- `ToolExecutionEvent` for the current generic `ExecutionEvent`.

The current controlled `WorkflowStepResult` becomes
`ControlledWorkflowStepResult`; the common facade introduces its own
`WorkflowStepResult`. `WorkflowResumeOutcome` becomes
`ControlledWorkflowResult`.

`createLocalAgentRunner` remains an explicit runtime constructor on
`./agent/runtime`; it is not the implementation of common `createAgent`.

### Conversation and interaction

`Conversation` is the common facade. The existing `InteractionSession`,
`InteractionRun`, `InteractionEvent`, projections, reconnect state and
reservation machinery remain extension APIs on `./interaction`; they are not
mechanically renamed into the common surface.

The common `ConversationEvent` is the projected user-facing event currently
represented by `InteractionUiEvent`. The two existing `ConversationTurn`
contracts are disambiguated:

- memory role/content history becomes `ConversationMessage`;
- interaction run history becomes `ConversationRunRecord`.

The durable session store family becomes `ConversationStore`,
`ConversationSnapshot`, `ConversationState` and qualified
`ConversationStore*Request`/`ConversationStoreReservation` values.

### Context and specification

`ContextManifest` and `createContextManifest` become `ContextSelection` and
`selectContext`.

Specification review returns:

```ts
type SpecificationDecision =
  | { status: "accepted"; record: SpecificationDecisionRecord }
  | { status: "rejected"; issues: readonly SpecificationIssue[] }
  | { status: "needs-input"; questions: readonly SpecificationQuestion[] };
```

`ApprovalDecision` may be evidence supplied to review. It is never verified
authority by itself.

`compileSpecification` returns `CompiledSpecification<T>`. For the built-in
target-neutral compiler, `T` is `ExecutionPlan`. `CompiledSpecification<T>` is
the authority-bound value accepted by controlled execution; extracting `T`
removes that authority.

The common Agent gateway is exact:

```ts
const compiled = await compileSpecification(decision, {
  target: executionPlanTarget,
});
const agent = createAgent({ specification: compiled });
await agent.run(input);
```

`AgentConfig.specification` accepts
`CompiledSpecification<ExecutionPlan>`. `createAgent`, `Agent.run` and
`Agent.start` revalidate its internal authority snapshot at their required
preparation and execution boundaries. There is no separate common `runAgent`
function.

Extension specification names are:

- `SpecificationSourceSnapshot`;
- `ConversionReport`, `ConversionIssue`, `ConversionFidelity`;
- `SpecificationAdapterSupport`; and
- `ProposedSpecificationChange`.

Internal-only names are:

- `SpecificationGraph`, `CheckedSpecification`;
- `AcceptedSpecificationHandle`;
- `CompilationAuthoritySnapshot`; and
- `verifyCompilationAuthority`.

Public documentation says supported formats, versions, operations and
features. `Conformance` is reserved for verification evidence.

### Package ownership

Curated common fronts:

- package root;
- `./agent`, `./tools`, `./workflow`, `./conversation`;
- `./model`, `./control`, `./context`, `./artifacts`, `./evaluation`.

Explicit extension fronts:

- `./agent/runtime`, `./tools/runtime`, `./workflow/runtime`,
  `./model/runtime`, `./control/runtime`;
- `./contracts`, `./evidence`, `./state`, `./interaction`;
- `./retrieval`, `./indexing`, `./storage`, `./memory`, `./media`; and
- every qualified `./adapters/*` front.

`./functional` is removed. The language rollout therefore has 29 public
entrypoints. The later `./specifications` front becomes the thirtieth and also
adds the common specification actions to the package root. No wildcard barrel
may feed a common front. Deep
registration brands, canonicalizers, provenance constructors, receipt
comparison helpers and internal reducers are not exported.

The complete current-export inventory is produced by
[`inventory-public-exports.mjs`](../../../tests/language/inventory-public-exports.mjs);
its common/internal exception policy is recorded in
[`public-export-classification.md`](../../../tests/language/public-export-classification.md).
Every export not in its common or internal exception set is an extension
export and moves to the extension front owned by its declaration source.

## Consequences

Ordinary examples become short and use familiar nouns. Extension authors retain
the exact contracts needed to implement security, durability, storage,
runtime, adapter and UI boundaries. The rollout is deliberately breaking and
adds no aliases.

The package root, package export map, TypeScript build entrypoints, build
script, declaration fixtures, examples and both READMEs must converge in one
`language-rollout` integration.

## Rejected alternatives

- Rename definitions directly to ready common objects.
- Mechanically rename all `Interaction*` machinery to `Conversation*`.
- Keep lifecycle machinery on common fronts for discoverability.
- Retain `./functional` as a public compatibility surface.
- Add friendly aliases while retaining old names.

## Naming and public API impact

`Config` means caller options, `Definition` means portable authored data,
`Result` means an operation outcome, `Event` means a stream fact, `Snapshot`
means portable stored state, and `Handle` means live runtime-owned authority.
Unqualified generic `RunResult`, `ToolResult`, `ExecutionEvent`, `Snapshot`,
`ProjectionEnvelope` and `ConversationTurn` names do not remain.

## Serialization and compatibility impact

Type, function and subpath renames are wire-neutral only while existing fields,
literal tags and canonical bytes remain unchanged.

- The common configs are new facade inputs and must not replace serialized
  `AgentDefinition` or `ToolDefinition` shapes.
- Changing `llm-core.action/v1`, action fields or digest inputs requires
  `llm-core.action/v2`.
- Changing event kinds, pause/checkpoint/snapshot discriminants or stored
  conversation fields requires a new owning format version and migration.
- Specification contracts are unshipped. Their first version freezes the
  `status`, `record`, `issues`, `questions`, `fidelity` and `disposition`
  fields and values declared here.
- Later changes to any portable contract require an explicit contract/schema
  version decision. TypeScript aliases are not a migration mechanism.

## Verification implications

- Five desired common-journey fixtures contain no port, binding, registry,
  provenance, envelope, snapshot, admission, projection, disposition or
  conformance vocabulary.
- Common fixtures import no `/runtime`, `./contracts`, `./evidence`, `./state`
  or `./interaction` front.
- A compiler-resolved inventory classifies all 731 current exports by
  runtime/type kind, disposition, exact target and action.
- Runtime and declaration imports pass from the isolated packed package.
- Serialized golden fixtures prove wire-neutral renames; versioned contracts
  cover every structural change.

## Follow-up tasks

- `language-vocabulary` synchronizes the canonical plans and task briefs.
- `language-rollout` implements this decision atomically.
- `specification-contracts` creates the first specification wire versions.
