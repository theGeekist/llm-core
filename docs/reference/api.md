# API by subpath

Version 2 publishes a contract-oriented root and explicit capability and integration subpaths.

| Subpath | Responsibility | Representative exports |
| --- | --- | --- |
| `@geekist/llm-core` | Portable contracts and specification journey | `defineTool`, `loadSpecification`, `reviewSpecification`, `compileSpecification` |
| `/contracts` | Portable primitives | identity, invocation, schema, versioning, capability claims |
| `/model` | Model contracts | requests, responses, content, prompts and references |
| `/model/runtime` | Model extension contracts | profiles, resolution and schema resolution |
| `/tools` | Tool declarations | `defineTool`, `Tool`, calls and results |
| `/tools/runtime` | Controlled tool execution | executable bindings, validation and canonical actions |
| `/control` | Portable decisions | policy, approval and cancellation values |
| `/control/runtime` | Control extension ports | authentication, verification and concurrency |
| `/evidence` | Events and receipts | redaction, execution events and journals |
| `/state` | State lifetimes | snapshots, native checkpoints and compatibility |
| `/agent` | Portable agent intent and facts | definitions, events, results and skills |
| `/agent/runtime` | Agent runtime SPI | `AgentRunner`, preparation and native-session contracts |
| `/workflow` | Portable workflow intent | `WorkflowExecutionPlan` |
| `/conversation` | Portable conversation state | events, snapshots and store contracts |
| `/interaction` | Explicit interaction orchestration | injected-runner sessions and projections |
| `/specifications` | Exact specification operations | source snapshots, closed five-operation matrices, target-bound change proposals, review, project and authority-bound compile results |
| `/adapters/catalogue` | Inert adapter selection | candidate descriptions, registration and deterministic resolution |
| `/adapters/catalogue/runtime` | Accepted adapter runtime | acquisition, invocation and bounded qualified retry |

The remaining context, artifact, evaluation, retrieval, indexing, storage, memory, media, UI, and qualified provider subpaths retain their documented capability ownership.

There is no `./workflow/runtime`, broad adapter barrel, local runner export, or root runnable Agent/Workflow/Conversation facade.
