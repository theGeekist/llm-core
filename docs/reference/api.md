# API by subpath

Version 2 publishes a small root and explicit capability and integration
subpaths. Import from the owner of the contract you use.

| Subpath                    | Responsibility              | Representative exports                                              |
| -------------------------- | --------------------------- | ------------------------------------------------------------------- |
| `@geekist/llm-core`        | Common application journeys | `createAgent`, `defineTool`, `defineWorkflow`, `createConversation` |
| `/contracts`               | Portable primitives         | identity, invocation, schema, versioning, capability claims         |
| `/model`                   | Common model values         | model requests, responses, content, prompts and references          |
| `/model/runtime`           | Model runtime extension     | profiles, resolution, schema resolution and runtime constructors    |
| `/tools`                   | Common tools                | `defineTool`, `Tool`, `ToolConfig`, calls and results               |
| `/tools/runtime`           | Tool runtime extension      | definitions, executable tools, validation, canonical actions        |
| `/control`                 | Common control decisions    | policy, approval and cancellation values                            |
| `/control/runtime`         | Control runtime extension   | authentication, verification, concurrency and policy ports          |
| `/evidence`                | Events and receipts         | `ToolExecutionEvent`, redaction, `ToolReceiptJournal`               |
| `/state`                   | State lifetimes             | snapshots, checkpoints, interventions, compatibility                |
| `/context`                 | Context selection           | `createContextEntry`, `selectContext`                               |
| `/artifacts`               | Outputs and provenance      | `createArtifact`, `createArtifactRef`                               |
| `/evaluation`              | Evidence-bound evaluation   | cases, evaluators, composition, results                             |
| `/agent`                   | Common agents               | `createAgent`, `Agent`, runs, events, results                       |
| `/agent/runtime`           | Agent runtime extension     | definitions, runners, profiles, skills, composition                 |
| `/workflow`                | Common workflow use         | `defineWorkflow`, `Workflow`, steps, results, ephemeral pause       |
| `/workflow/runtime`        | Workflow runtime extension  | composition, registry, controlled resume, journals                  |
| `/conversation`            | Common conversations        | `createConversation`, runs, events and results                      |
| `/interaction`             | Interaction extension APIs  | raw events, projections, explicit runner sessions, reconnect state  |
| `/retrieval`               | Retrieval extension         | loaders, splitters, embedders, retrievers and query values          |
| `/indexing`                | Indexing extension          | indexing requests, results and vector stores                        |
| `/storage`                 | Storage extension           | cache, key-value and resource stores                                |
| `/memory`                  | Memory extension            | conversation messages and persistent memory stores                  |
| `/media`                   | Media extension             | image, speech and transcription ports and values                    |
| `/adapters/ai-sdk`         | AI SDK 7 model integration  | qualified model adapter                                             |
| `/adapters/ai-sdk-ui`      | AI SDK UI projection        | canonical event mapper                                              |
| `/adapters/assistant-ui`   | assistant-ui projection     | command mapper                                                      |
| `/adapters/openai-chatkit` | ChatKit projection          | custom event mapper                                                 |
| `/adapters/nlux-ui`        | NLUX projection             | chat adapter                                                        |

The package exposes no broad adapter barrel and no global recipe catalogue.
Deep feature imports are implementation details.

See the capability pages for behavior and guarantees, and
[Package exports](/reference/package-exports) for packaging constraints.
