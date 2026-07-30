# Migrate from 1.x to 2.0

Version 2 is a breaking replacement. Migrate execution concepts and imports
together; do not add compatibility aliases.

| 1.x                                           | 2.0                                                             |
| --------------------------------------------- | --------------------------------------------------------------- |
| `AgentRuntime`, `createAgentRuntime`          | `AgentRunner`, `createLocalAgentRunner`                         |
| `AgentRuntimeInput`                           | `AgentRunRequest`                                               |
| agent execution returning workflow `Outcome`  | live `AgentRun`, then `RunResult`                               |
| `AdapterBundle`                               | typed capability bindings and explicit ports                    |
| `createAdapterRegistry`                       | deterministic capability binding resolution                     |
| `AdapterCallContext`                          | `InvocationContext`                                             |
| adapter-owned `Model` and content             | `@geekist/llm-core/model`                                       |
| adapter-owned tools                           | `@geekist/llm-core/tools`                                       |
| adapter-owned storage and retrieval contracts | curated `@geekist/llm-core/agent` ports                         |
| adapter-owned media contracts                 | curated `@geekist/llm-core/model` ports                         |
| `EventStream`                                 | `EventSink` for evidence or `AgentRun.events()` for consumption |
| `TraceEvent` history                          | `ExecutionEvent`, `AgentRunEvent`, or `InteractionEvent`        |
| `artefact`                                    | `artifact`                                                      |
| broad adapter import                          | a qualified adapter subpath                                     |
| recipe catalogue import                       | explicit workflow or agent composition                          |
| `/diagnostics`                                | application-owned diagnostic projection                         |
| workflow `Plugin` hooks                       | explicit composition around definitions and runner ports        |
| recipe `Pack` composition                     | ordinary arrays, records, and application composition           |
| `/adapters/langchain`                         | application adapter or curated `/agent` memory/storage ports    |
| `/adapters/llamaindex`                        | application adapter or curated retrieval/indexing ports         |
| `/adapters/primitives`                        | direct neutral capability ports                                 |

## Root agent run

Before:

```ts
import { createAgentRuntime } from "@geekist/llm-core";

const outcome = await createAgentRuntime(options).run({
  prompt: "hello",
});
```

After:

```ts
import { createLocalAgentRunner } from "@geekist/llm-core";

const runner = createLocalAgentRunner(options);
const agent = await runner.prepare(spec);
const run = await runner.start({
  agent,
  invocationContext,
  input: { prompt: "hello" },
});

for await (const event of run.events()) {
  consume(event);
}
const result = await run.result();
```

Preparation is runner-owned. A run is a live control/event handle, while
`RunResult` is its one terminal value.

## Adapter bundle to typed bindings

Before:

```ts
const adapters = {
  model,
  retriever,
  cache,
};
const runtime = createAgentRuntime({ adapters });
```

After:

```ts
import { createCapabilityBindingCatalog } from "@geekist/llm-core/agent";

const catalog = createCapabilityBindingCatalog({
  verifyEvidence,
  evaluateCondition,
});

catalog.register(modelBinding);
catalog.register(retrieverBinding);
catalog.register(cacheBinding);

const resolution = catalog.resolve({
  requirements: [
    { kind: "model", bindingId: modelBinding.descriptor.bindingId },
    { kind: "retriever", bindingId: retrieverBinding.descriptor.bindingId },
    { kind: "cache-store", bindingId: cacheBinding.descriptor.bindingId },
  ],
});

if (resolution.kind === "unresolved") {
  throw new Error(JSON.stringify(resolution.diagnostics));
}
```

Bindings carry evidence-backed portable descriptors and exact live ports.
Resolution never silently chooses the first implementation.

## Recipes to explicit composition

Before:

```ts
import { recipes } from "@geekist/llm-core/recipes";

const result = await recipes.rag.run(input, { adapters });
```

After, compose the steps that your application owns:

```ts
import { textRetrievalQuery } from "@geekist/llm-core/agent";

const retrieved = await ports.retriever.retrieve({
  request: { query: textRetrievalQuery(input.question) },
  context: invocationContext,
});
const run = await runner.start({
  agent: answerAgent,
  invocationContext,
  input: {
    question: input.question,
    documents: retrieved.documents,
  },
});
const result = await run.result();
```

Use `@geekist/llm-core/workflow` for authenticated checkpoint resume. There is
no global recipe catalogue in 2.0.

## Removed diagnostics and composition helpers

Version 2 does not publish `/diagnostics`. Keep operational diagnostic objects
in the application or observability adapter that owns their schema. Portable
failures use the closed error, outcome, receipt, and diagnostic unions exported
by the capability that produces them; do not recreate a generic cross-domain
diagnostic bag.

The V1 recipe `Pack` and workflow `Plugin` abstractions are also removed.
Compose ordinary definitions and ports at the application boundary:

- use `composeWorkflow` for reusable passive workflow definitions;
- use `createModelToolAgentProgram` for the model/tool agent loop;
- wrap a runner, model, or workflow explicitly when the application needs
  hooks;
- keep hook configuration live and outside portable specs or checkpoints.

There is no plugin registry with hidden execution authority in V2.

## Removed framework adapter subpaths

The LangChain, LlamaIndex, and primitives subpaths are not published in V2.
Their former responsibilities split by ownership:

| Removed subpath        | Migration path                                                        |
| ---------------------- | --------------------------------------------------------------------- |
| `/adapters/langchain`  | Implement application adapters against `/agent` memory/storage ports  |
| `/adapters/llamaindex` | Implement application adapters against retrieval/indexing/store ports |
| `/adapters/primitives` | Bind the relevant neutral port directly                               |

Do not import old implementation files by deep path. If an application still
needs one integration, own it at the boundary, pin the native version, declare
semantic loss, redact native data, and qualify it with conformance evidence.

## Tool control

Before:

```ts
const result = await tool.execute(argumentsValue);
```

After:

```ts
import { executeControlledTool } from "@geekist/llm-core/control";

const outcome = await executeControlledTool({
  binding,
  call,
  securityDomain,
  digestKeyRef,
  digestPort,
  journal,
  policy,
  approval,
  concurrency,
  facts,
  eventSink,
});
```

The orchestrator reserves the authoritative receipt first, records policy and
approval transitions, acquires concurrency separately, durably records
`started`, then invokes. Meaningful effects fail closed when any prerequisite
is absent.

## Workflow resume

Before:

```ts
const outcome = await runtime.resume(resumeToken, input);
```

After:

```ts
import { resumeInterventionWorkflow } from "@geekist/llm-core/workflow";

const outcome = await resumeInterventionWorkflow({
  checkpoint,
  intervention,
  decision,
  expectedCompatibility,
  securityDomain,
  actionDigestPort,
  authentication,
  clock,
  journal,
  steps,
});
```

Only a registered compatible checkpoint can resume. Recorded started or
indeterminate effects return reconciliation requirements instead of replaying.

## Interaction session and UI projection

Before:

```ts
const session = createInteractionSession(runtime);
const transport = createUiSdkAdapter(session);
```

After:

```ts
import { createInteractionSession } from "@geekist/llm-core/interaction";
import { createAiSdkUiProjectionMapper } from "@geekist/llm-core/adapters/ai-sdk-ui";

const session = createInteractionSession({
  conversationId,
  agent,
  runner,
  store,
  identity,
});
const interactionRun = await session.send({
  input: { prompt: "hello" },
  invocationContext,
});
const project = createAiSdkUiProjectionMapper();

for await (const event of interactionRun.events()) {
  for (const chunk of project(event)) {
    await uiStream.write(chunk);
  }
}
await interactionRun.result();
```

The session store atomically reserves a conversation revision before the
runner executes. UI projection consumes canonical, redacted events and is not
an execution or persistence authority.
