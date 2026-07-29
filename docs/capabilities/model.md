# Models

The model front uses `ModelRequest`, `ModelResponse`, `ModelProfile`, and typed
content parts. A profile describes verified behavior; it is not a provider
client.

The AI SDK integration is qualified:

```ts
import { createAiSdk7Model } from "@geekist/llm-core/adapters/ai-sdk";
```

The adapter accepts live provider dependencies at composition time. Provider
metadata is omitted unless a trusted redactor projects safe JSON under the
AI SDK extension namespace. Schema identity remains separate from a live schema
resolver.
