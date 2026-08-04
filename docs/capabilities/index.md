# Capabilities

A capability is a stable contract for one kind of work. The contract describes
portable inputs and outputs. A live implementation enters later through
explicit host composition, a capability adapter, or the runtime integration
selected by your application.

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
| `@geekist/llm-core/agent`      | Portable agent intent and normalized execution facts                                  |

The capability pages follow the same path you use in an application:

1. Define portable contracts.
2. Supply qualified live implementations.
3. Supply intent and capabilities to a qualified runtime integration.
4. Preserve redacted evidence and explicit state.

Retrieval, indexing, storage, memory, and media are independent capability
fronts at `/retrieval`, `/indexing`, `/storage`, `/memory`, and `/media`.
`/model` owns provider-neutral model requests, responses, profiles, and content
contracts. None of these fronts selects a hosted service, executes an agent
loop, or exposes provider-native clients.
