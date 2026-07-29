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
