# Public Language Review

Architecture version: v2
Status: findings complete; exact replacement map pending
Decision proposal:
[`ADR-011`](decisions/ADR-011-accessible-public-language.md)
Implementation stage: language

## Outcome

`llm-core` keeps its rigorous internal lifecycle and presents a much smaller
public mental model.

Common usage should read in familiar application language:

```text
create an agent -> run it -> read the result
define a tool -> give it to an agent
define a workflow -> run or resume it
open a conversation -> send a message
load a specification -> review it -> compile it -> run the plan
```

Preparation provenance, capability bindings, registration, authority
snapshots, projection envelopes, durable claims and storage reservations remain
available where an extension author must implement them. They are not steps in
the ordinary journey.

## Why the pass is required

The architecture is coherent, but its implementation vocabulary has escaped
into common usage:

- the package README constructs an `AgentSpec`, requires a version brand,
  declares an external `AgentRunner` and stops at `prepare()`;
- the smallest complete local run requires identity generation, invocation
  context and a program port;
- a small tool requires schema registration, hashing, validation, execution
  semantics and a binding;
- the agent subpath also exposes capability resolution, retrieval, indexing,
  storage and memory;
- the workflow subpath combines ordinary authoring with durable claims,
  journals, clocks and coordinator tokens; and
- the proposed specification API names every internal transition from source
  observation to execution authority.

Each term can be defended in isolation. Together they make the package appear
harder to use than it should be.

## Industry baseline

Current agent libraries differ internally but converge on a small common
vocabulary:

- agent;
- tool;
- run or invoke;
- result or output;
- workflow;
- message or conversation;
- approval; and
- model.

OpenAI Agents, PydanticAI and LangChain all let a user create an agent and run
it without first naming preparation provenance or capability registration.
AI SDK tools similarly place schema and `execute` on one tool value. `llm-core`
should follow those familiar entry concepts while retaining its stronger
portable-contract and controlled-effect guarantees beneath them.

Primary references:

- [OpenAI Agents SDK: running agents](https://openai.github.io/openai-agents-js/guides/running-agents/)
- [PydanticAI: agents](https://pydantic.dev/docs/ai/core-concepts/agent/)
- [LangChain JavaScript: agents](https://docs.langchain.com/oss/javascript/langchain/agents)
- [AI SDK: tools and tool calling](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling)

## Three language levels

| Level     | Audience                  | Examples                                                                                          |
| --------- | ------------------------- | ------------------------------------------------------------------------------------------------- |
| Common    | Application author        | `Agent`, `Tool`, `Workflow`, `Conversation`, `Specification`, `run`, `result`, `approval`, `plan` |
| Extension | Runtime or adapter author | runner, store, policy, receipt, checkpoint, compatibility, conversion report                      |
| Internal  | Core implementation       | binding provenance, registration token, authority snapshot, envelope, claim, coordinator journal  |

A type may remain publicly importable for host implementations without
belonging to the common journey. Package placement and documentation must make
that distinction visible.

## Naming rules

1. Start with the user action, not the internal lifecycle.
2. Use one ordinary noun for one concept.
3. Put lifecycle state in a discriminated result instead of a chain of branded
   nouns where possible.
4. Use `Definition` for portable user-authored behavior only when the authored
   value needs to be named separately from its ready-to-use object.
5. Use `Run` for one live execution and `Result` for its terminal value.
6. Use `Store` for a persistence contract and `Adapter` for external
   translation.
7. Use `Approval` only for an authenticated human decision. Use `Policy` for
   machine-evaluated rules. A broader decision that may use either must receive
   its own domain name.
8. Reserve `Profile` for observed or declared capability metadata.
9. Keep `Binding`, `Registered`, `Prepared`, `Port`, `Projection`,
   `Disposition`, `Semantics` and provenance terminology out of common
   examples.
10. Prefer `external effect` or `side effect` in reader-facing prose.
    `Meaningful effect` remains an internal policy classification only if the
    distinction is still required.
11. Prefer `conversation` or `chat` for messaging. Keep `interaction` for the
    broader event and UI integration capability.
12. Reserve `Specification` for the specification-interoperability capability.
    A PydanticAI `AgentSpec` remains a native adapter term.

### Suffix grammar

| Suffix       | Reserved meaning                                  |
| ------------ | ------------------------------------------------- |
| `Config`     | User-authored options                             |
| `Definition` | Portable declared behavior                        |
| `Request`    | Input to one operation                            |
| `Result`     | Output from one operation                         |
| `Ref`        | Structured portable reference                     |
| `Id`         | Scalar identity                                   |
| `Handle`     | Live or runtime-owned object                      |
| `Event`      | Emitted fact                                      |
| `Record`     | Stored durable value                              |
| `Store`      | Read/write behavior                               |
| `Adapter`    | External integration                              |
| `Port`       | Extension-author contract, absent from common use |

`Outcome`, `Resolution`, `Verification`, `Authorization`,
`Acknowledgement`, `Judgement` and `Disposition` are not interchangeable
generic result suffixes. Keep one only when it names a distinct domain concept;
otherwise return a scoped `Result`.

## Journey contracts

These examples express the target experience. language-vocabulary owns the exact signatures
and compile fixtures.

### Agent

```ts
const agent = createAgent({
  model,
  instructions: "Answer clearly.",
  tools,
});

const result = await agent.run("Why is the sky blue?");
```

### Tool

```ts
const search = defineTool({
  name: "search",
  description: "Search the knowledge base.",
  input: searchInput,
  effect: "read-only",
  execute: async ({ query }) => knowledge.search(query),
});
```

### Streaming run

```ts
const run = agent.start("Research this topic.");

for await (const event of run.events()) {
  render(event);
}

const result = await run.result();
```

### Workflow

```ts
const publishing = defineWorkflow({
  steps: [draft, review, publish],
});

const result = await publishing.run(initialState);
```

### Conversation

```ts
const conversation = createConversation({ agent, store });

for await (const event of conversation.stream("Hello")) {
  render(event);
}
```

### Specification

```ts
const specification = await loadSpecification(source);
const review = await reviewSpecification(specification, { policy, evidence });

if (review.status === "accepted") {
  const plan = await compileSpecification(review, { target: agentTarget });
  const agent = createAgent({ specification: plan });
  await agent.run(input);
}
```

`source` is detached input produced by any compatible framework adapter. The
common journey is not owned by OpenSpec or any other source format. When a
human decision is required, an `ApprovalDecision` may appear in the review
evidence. The portable object is not verified authority by itself: admission
must authenticate it and bind the authenticated actor, scope and decision
before relying on it.

The implementation may provide a safe convenience operation combining review
and compilation. It must not make import itself an authorization step.

## Exact term disposition

ADR-012 proposes this exact replacement map:

| Current term                        | Exact disposition                                                        |
| ----------------------------------- | ------------------------------------------------------------------------ |
| `AgentSpec`                         | Extension `AgentDefinition`; common ready object `Agent`                 |
| `PreparedAgentSpec`                 | Extension `PreparedAgentDefinition`                                      |
| `createLocalAgentRunner`            | Stays on `./agent/runtime`; common facade is `createAgent`               |
| `RunResult`                         | Common `AgentResult`                                                     |
| `ToolSpec` / `defineToolSpec`       | Extension `ToolDefinition` / `defineToolDefinition`                      |
| `ToolBinding`                       | Common ready object `Tool`; binding machinery moves to `./tools/runtime` |
| `ToolResult` / `ToolFailure`        | `ToolExecutionResult` / `ToolExecutionFailure`                           |
| `ExecutableWorkflowStep`            | Common `WorkflowStep`                                                    |
| `WorkflowExecutionOutcome`          | Common `WorkflowResult`                                                  |
| `WorkflowPauseSnapshot`             | Common `WorkflowPause`                                                   |
| `MeaningfulWorkflowStep`            | Runtime extension `ControlledWorkflowStep`                               |
| `InteractionUiEvent`                | Common `ConversationEvent`                                               |
| raw `Interaction*` machinery        | Extension `./interaction`; not mechanically renamed                      |
| capability binding resolution types | Extension surface, not common `./agent` vocabulary                       |
| `ContextManifest`                   | Common `ContextSelection`; factory `selectContext`                       |
| `SpecificationSet`                  | Public `Specification`; internal `SpecificationGraph`                    |
| `ResolvedSpecification`             | Internal `CheckedSpecification`                                          |
| admission / admit                   | Public specification review and decision                                 |
| specification review outcome        | `SpecificationDecision`: accepted, rejected or needs-input               |
| `AcceptedSpecificationRecord`       | `SpecificationDecisionRecord` on the accepted decision branch            |
| `RegisteredAcceptedSpecification`   | Internal `AcceptedSpecificationHandle`                                   |
| projection / project                | Public compile or convert                                                |
| `ProjectionEnvelope<T>`             | `CompiledSpecification<T>`; target-neutral payload `ExecutionPlan`       |
| `ProjectionAuthoritySnapshot`       | Internal `CompilationAuthoritySnapshot`                                  |
| `SpecificationChangeProposal`       | `ProposedSpecificationChange`                                            |
| conformance                         | Public supported features, versions or compatibility                     |
| qualified adapter                   | Public framework or provider adapter                                     |

## Specification lifecycle language

The detailed architecture retains eight distinct boundaries. Reader-facing
labels use ordinary verbs:

```text
Load source
-> Read format
-> Combine specifications
-> Check specification
-> Build plans
-> Decide
-> Compile
-> Propose changes
```

Reconciliation, resolution, runtime registration and authority-snapshot
verification remain exact internal responsibilities.

## Surface findings

- The root needs a complete useful journey, not only a low-level runner
  constructor.
- `./agent` must stop aggregating retrieval, indexing, storage, memory and
  capability-binding internals.
- `./tools` must distinguish tool authoring from canonical action and
  controlled-execution machinery.
- `./workflow` must distinguish ordinary workflow authoring from durable
  controlled resume.
- `./interaction` must distinguish conversation use from event-reducer and
  reservation implementation.
- Wildcard feature barrels must not determine the user-facing language.
- Advanced contracts may remain explicit subpath exports where hosts genuinely
  need to implement them.

### Capability fronts

- `./model` should expose ordinary model use separately from routing,
  registration, schema loading, sanitization and media adapter helpers.
- `./control` should keep the natural policy, approval and cancellation
  concepts while moving authentication ports and orchestration helpers to an
  extension surface.
- `ExecutionEvent` should be reviewed as `ToolExecutionEvent`; the existing
  generic name collides with agent and interaction events.
- `Snapshot` should be qualified by its owner or lifetime.
- `ContextManifest` should be reviewed as selected context rather than making a
  manifest part of the common agent path.
- `Artifact`, `ArtifactRef`, `EvaluationCase`, `EvaluationCriterion` and
  `EvaluationResult` are already approachable.
- Repeated scoped names such as `EvaluationEvaluator`,
  `EmbedderEmbedInput` and `RetrieverRetrieveInput` should use their subpath and
  method context instead of restating the whole sentence in one type.
- Capability binding, registration brands and retry guarantee plumbing belong
  to an adapter or capability-author surface, not `./agent`.

## Usability gate

Every common journey receives a typechecked README-sized fixture. A common
fixture fails the language gate if it requires any of these words:

```text
port
binding
registry
provenance
envelope
snapshot
admission
projection
disposition
conformance
```

An advanced extension fixture may use those terms when it implements the
corresponding guarantee.

## Stage boundary

The language stage runs before the specifications stage:

1. language-audit records this audit and the five journey contracts.
2. language-vocabulary ratifies the exact term map, export classification and desired API
   fixtures.
3. `language-rollout` changes source, root entrypoints, exports, tests,
   examples and documentation as one atomic integration, then verifies the
   packed package and common-journey usability.

`specification-contracts` remains blocked until `language-rollout` is complete.
This prevents specification work from cementing a second layer of inaccessible
public terms.
