---
title: End-to-End UI
---

# End-to-End UI (Interaction + Host + Adapter)

This guide shows the **full path** from a single turn to a UI stream:
interaction core -> session orchestration -> UI SDK adapter.

The goal is to keep logic headless and deterministic while still delivering UI-friendly
chunks or commands.

---

## 1) Working demo

<<< @/snippets/guide/end-to-end-ui.js#docs

What you get:

- A single `handleChatTurn` entrypoint for app/API code.
- UI commands emitted as the model streams.
- Durable state via session storage.

---

## 2) Options and interoperability

### Swap UI adapters without touching interaction logic

```diff
- import { createAssistantUiInteractionEventStream } from "@geekist/llm-core/adapters";
+ import { createAiSdkInteractionEventStream } from "@geekist/llm-core/adapters";

- const eventStream = createAssistantUiInteractionEventStream({ sendCommand });
+ const eventStream = createAiSdkInteractionEventStream({ sendChunk });
```

Other UI adapters:

- `createAssistantUiInteractionEventStream` (assistant-ui)
- `createAiSdkInteractionEventStream` (Vercel AI SDK)
- `createChatKitInteractionEventStream` (OpenAI ChatKit)

### Swap host transports (SSE, WebSocket, Worker)

Any `EventStream` implementation works. You can emit events over SSE, WebSocket, or a
worker stream without changing interaction or session code.

See:

- [Host Glue](/interaction/host-glue)

### Add session policies (summarize / truncate)

Policies remain adapter-driven, so hosts decide when and how to apply them.

---

## 3) Why this is better than ad-hoc UI wiring

- **Headless by default**: UI SDKs stay in adapters, not runtime logic.
- **Deterministic events**: the interaction reducer shapes state consistently.
- **Composable storage**: swap Redis/KV/in-memory stores without touching your UI.

---

## Next step

If you need multi-step orchestration (RAG, tools, HITL), move to full workflows:

- [Workflow Orchestration](/guide/hello-world)
