# API by subpath

Version 2 publishes a small root and explicit capability and integration
subpaths. Import from the owner of the contract you use.

| Subpath                    | Responsibility                   | Representative exports                                                                  |
| -------------------------- | -------------------------------- | --------------------------------------------------------------------------------------- |
| `@geekist/llm-core`        | Local agent composition          | `createLocalAgentRunner`, `prepareAgentSpec`, agent run types                           |
| `/functional`              | Sync-preserving composition      | `composeK`, `maybeMap`, `maybeChain`, `maybeReduce`, `maybeAll`, step/iterable adapters |
| `/contracts`               | Portable primitives              | identity, invocation, schema, versioning, capability claims                             |
| `/model`                   | Models and media                 | model requests, profiles, resolution, media ports                                       |
| `/tools`                   | Tool definitions                 | schemas, bindings, validation, canonical actions                                        |
| `/control`                 | Control and controlled execution | policy, approval, cancellation, concurrency, `executeControlledTool`                    |
| `/evidence`                | Events and receipts              | `ExecutionEvent`, redaction, `ToolReceiptJournal`                                       |
| `/state`                   | State lifetimes                  | snapshots, checkpoints, interventions, compatibility                                    |
| `/context`                 | Context selection                | `createContextEntry`, `createContextManifest`                                           |
| `/artifacts`               | Outputs and provenance           | `createArtifact`, `createArtifactRef`                                                   |
| `/evaluation`              | Evidence-bound evaluation        | cases, evaluators, composition, results                                                 |
| `/agent`                   | Agent application surface        | runner types, skills, capability bindings, retrieval, indexing, storage, memory         |
| `/workflow`                | Ordered orchestration            | definitions, registry, run, pause, resume                                               |
| `/interaction`             | Sessions and projection          | canonical events, projections, conversation sessions                                    |
| `/adapters/ai-sdk`         | AI SDK 7 model integration       | qualified model adapter                                                                 |
| `/adapters/ai-sdk-ui`      | AI SDK UI projection             | canonical event mapper                                                                  |
| `/adapters/assistant-ui`   | assistant-ui projection          | command mapper                                                                          |
| `/adapters/openai-chatkit` | ChatKit projection               | custom event mapper                                                                     |
| `/adapters/nlux-ui`        | NLUX projection                  | chat adapter                                                                            |

The package exposes no broad adapter barrel and no global recipe catalogue.
Deep feature imports are implementation details.

See the capability pages for behavior and guarantees, and
[Package exports](/reference/package-exports) for packaging constraints.
