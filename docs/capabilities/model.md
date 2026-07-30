# Model and media

The `/model` subpath defines provider-neutral model and media contracts.
`ModelRequest` carries messages, tools, response format, sampling, and redacted
metadata. `ModelResponse` represents either a completion or a structured error.

Content uses a closed union: text, JSON, inline binary, media reference,
reasoning, tool call, and tool result. A `media-ref` points to a `ResourceRef`;
an authorized resolver supplies its bytes only when execution needs them.

<<< @/snippets/v2/model-media.ts

## Profiles describe verified behavior

A `ModelProfile` records model, provider, deployment, contract version, and
evidence-backed capability claims. It is portable data, not a provider client.
Registering a profile validates, clones, and freezes it.

## Resolve a model binding

`ModelRef` expresses logical selection intent. `ProviderRef` identifies a
service dialect, while `DeploymentRef` identifies one configured endpoint.
None carries a credential or executable client.

<<< @/snippets/v2/model-resolution.ts

`createModelResolver` evaluates bindings deterministically:

1. an exact `ModelRef` match wins before aliases;
2. without an explicit selection, a named `policy.defaultModel` is required;
3. policy allow-lists and required evidence-backed capabilities filter matches;
4. constraints require a trusted evaluator and fail closed on throws or
   non-boolean results;
5. zero eligible bindings and multiple eligible bindings return unresolved
   outcomes with diagnostics.

The resolver never selects the first candidate, reads credentials, silently
downgrades a requirement, or turns a provider/deployment identity into model
selection intent.

The built-in model is deterministic and useful for local composition and
tests. Provider integrations remain qualified adapter imports, for example:

```ts
import { createAiSdk7Model } from "@geekist/llm-core/adapters/ai-sdk";
```

The adapter receives live provider dependencies during composition. Provider
metadata crosses the boundary only after a trusted redactor projects safe JSON
into a namespaced extension.

## Media ports

`ImageGenerationPort`, `SpeechGenerationPort`, and `TranscriptionPort` accept
live bytes or authorized resource references and return portable media. A
`MediaOutputProjector` decides whether output is safe to inline or should become
a resource reference.

Schema identity and resource identity stay separate from the live resolvers
that interpret schemas or load bytes.
