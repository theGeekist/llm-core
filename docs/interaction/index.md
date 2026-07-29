# Interaction

Interaction sessions coordinate conversation state with an `AgentRunner` and
project canonical events into UI-ready state.

```ts
import { createInteractionSession } from "@geekist/llm-core/interaction";
```

The session store is storage-neutral and must reserve revisions atomically.
Provider continuity remains opaque. UI integrations consume projection events;
they do not become an execution authority.

Qualified UI fronts are available for AI SDK UI, assistant-ui, OpenAI ChatKit,
and NLUX. Each maps canonical interaction events into the target UI protocol.
