# Capabilities

A capability is a stable contract for one kind of work. The contract describes
portable inputs and outputs. A live implementation enters later, when your
application composes an agent or workflow.

This separation lets application code depend on what a component does without
depending on the provider or framework that performs it.

| Import                         | Responsibility                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------------- |
| `@geekist/llm-core/contracts`  | Identity, versioning, schemas, resources, evidence references, and invocation context |
| `@geekist/llm-core/model`      | Model requests, responses, profiles, content, and media                               |
| `@geekist/llm-core/tools`      | Tool specifications, bindings, strict argument validation, and action digests         |
| `@geekist/llm-core/control`    | Policy, approval, cancellation, concurrency, and controlled tool execution            |
| `@geekist/llm-core/evidence`   | Redacted execution events and storage-neutral receipt journals                        |
| `@geekist/llm-core/state`      | State lifetimes, intervention contracts, and resume compatibility                     |
| `@geekist/llm-core/context`    | Scoped, budgeted context manifests                                                    |
| `@geekist/llm-core/artifacts`  | Portable output identity and provenance                                               |
| `@geekist/llm-core/evaluation` | Evidence-bound cases, evaluators, and results                                         |
| `@geekist/llm-core/agent`      | Agent execution and composition, including retrieval, indexing, storage, and memory   |

The capability pages follow the same path you use in an application:

1. Define portable contracts.
2. Supply qualified live implementations.
3. Orchestrate work through an agent or workflow.
4. Preserve redacted evidence and explicit state.

Retrieval, indexing, storage, and memory are curated through `/agent`. Media is
curated through `/model`. These contracts do not select hosted services or
expose provider-native clients.
