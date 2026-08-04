# Stage 21 — UI SDK Adapters + Host (Out-of-Core)

Status: complete.

Purpose: add **first-class UI SDK adapters** and **host transport** without polluting core.
These live in separate packages/modules and map Interaction Core events/state into UI SDK primitives
(streams, hooks, chunks). The core remains headless; adapters do the bridging.

This stage encodes the decisions from the UI SDK discussion:

- Provider-side AI SDK integration already exists (model adapters).
- UI-side integrations should be adapters/sinks, not runtime logic.
- Vercel AI SDK is the flagship example.
- OpenAI ChatKit JS is optional/secondary due to churn.

## Context Summary (from design discussion)

We separated three families:

1. **Transport / HTTP clients** — OpenAI SDK, raw HTTP (no UI).
2. **Stateful UI SDKs** — Vercel AI SDK (useChat, streaming, SSE).
3. **UI component libraries** — Reachat, assistant-ui (UI only).

Core belongs to (1) and the domain runtime; UI integrations belong to (2) or as adapters in (3).

## Additional Context (AI SDK + LangChain bridge)

We already ship provider-side AI SDK adapters in `src/adapters/ai-sdk/*` (models, tools, embeddings,
rerankers, memory, cache, media). Stage 21 is explicitly about **UI-side** integrations, so the
new work should mirror the adapter boundary used by `@ai-sdk/langchain`:

- It provides a `toUIMessageStream` adapter that maps LangChain/LangGraph streams into AI SDK
  `UIMessageChunk` streams with deterministic start/delta/end ordering.
- It maintains per-message state to avoid duplicate emissions and to finalize text/tool/reasoning
  segments in the right order.
- It maps `custom` events to `data-{type}` chunks and uses `id` for persistence vs transient
  delivery.
- It exposes a host-transport adapter (`LangSmithDeploymentTransport`) that bridges a remote
  graph into the AI SDK `ChatTransport` interface.

Stage 21 should borrow these ideas but apply them to **Interaction Core**:

- Provide a stream adapter that maps `InteractionEvent` to UI SDK chunks (AI SDK first).
- Keep ordering deterministic, with start/delta/end semantics for text, reasoning, tools.
- Map Interaction custom events to `data-{type}` with id-based persistence semantics.
- Treat HITL/approvals as first-class stream events.
- Keep host transport glue out of core (mirroring the LangSmith transport pattern).

## Additional Context (Installed UI Ecosystems)

We installed the following UI-layer packages to map patterns that should inform Stage 21:

- `@ai-sdk/react` (AI SDK UI hooks + ChatTransport surface).
- `@openai/chatkit` (ChatKit Web Component + DOM event model; types only).
- `@assistant-ui/react-ai-sdk` (assistant-ui bridge to AI SDK; transport + message conversion).
- `@assistant-ui/react` (assistant-ui transport protocol + message/part types).
- `@unified-llm/core` (unified streaming event model with explicit start/delta/stop/error).
- `@node-llm/core` (provider-agnostic chat surface + stream wrapper utilities).
- `@mastra/core` (rich stream event taxonomy + OTEL-aligned tracing surfaces).
- `@nlux/core` (UI-first adapter contract with stream/batch observers + context integration).

### Patterns we should borrow (when applicable)

1. **Transport-first integrations (AI SDK)**

   - `ChatTransport` is the contract that `useChat` consumes.
   - Stream protocol is explicit (`streamProtocol`), and message parts are normalized.
   - This should drive an adapter that outputs **UIMessageChunk** and an optional transport helper.

2. **Event-first integrations (ChatKit)**

   - ChatKit is event-driven (custom element events like `chatkit.response.start/end`).
   - This suggests a parallel adapter style: `InteractionEvent` → DOM events, not just streams.
   - We should define an **event emitter adapter** in addition to stream adapters.

3. **Bridge adapters (assistant-ui)**

   - `@assistant-ui/react-ai-sdk` bridges AI SDK streams to assistant-ui.
   - It models `data-*` and tool parts and includes an `AssistantChatTransport` wrapper.
   - `@assistant-ui/react` defines an **assistant-transport** protocol with commands/state.
   - This points to a secondary adapter that can emit assistant-transport commands or
     reuse the AI SDK adapter via their bridge.

4. **Event contracts with explicit lifecycle (unified-llm)**

   - Streaming uses a deterministic event sequence: `start → text_delta* → stop → error`.
   - Each event can include both delta and accumulated text, plus `rawResponse` on the final chunk.
   - This is a strong fit for UI adapters and should inform our mapping rules for
     Interaction stream events (explicit start/delta/end, deterministic ordering).

5. **Fluent chat surfaces + stream utilities (node-llm)**

   - A fluent `chat().ask()` / `chat().stream()` surface with persistent history is a useful
     DX pattern for app developers.
   - Stream utilities like `tee()` and `toArray()` highlight expectations for downstream
     consumer ergonomics (debugging, fan-out).
   - We should keep this in mind for optional host helpers or future façade layers.

6. **Rich stream taxonomy + data-\* payloads (mastra)**

   - Explicit chunk types for `text-start/delta/end`, `reasoning-*`, `tool-call`, `tool-result`,
     `tool-call-input-streaming-*`, `data-*`, and `error` confirm the value of a granular
     event vocabulary.
   - Their `data-*` pattern aligns with our custom event mapping for UI SDKs.
   - Tool-call input streaming is a potential extension for Interaction events once tool
     streaming is supported.

7. **UI adapter contracts + context bridging (nlux)**

   - `ChatAdapter` defines `streamText` (observer `next/complete/error`) and `batchText`.
   - `ChatAdapterExtras` includes `conversationHistory` and `contextId` (maps cleanly to
     `InteractionState` + session IDs).
   - This is a strong candidate for a first-class UI adapter in Stage 21.

### Implications for Stage 21 design

- Define **agnostic adapter contracts** that support both:
  - **stream adapters** (`InteractionEvent` → UIMessageChunk/ReadableStream)
  - **event adapters** (`InteractionEvent` → DOM/custom events)
- Keep mapping rules explicit: text/reasoning/tool/data parts with deterministic ordering.
- Treat HITL/approval as first-class events (stream chunk or DOM event).
- Prioritize adapters where UI contracts are explicit and stable (NLUX, AI SDK),
  and keep streaming event vocabularies explicit (start/delta/end/error).

## Goals

- Provide adapter bridges that map:
  - `InteractionEvent` → UI SDK stream/chunk shape.
  - `InteractionState` → UI SDK message/state shape (optional).
- Provide EventStream implementations backed by UI SDK transport primitives.
- Keep these adapters in **separate packages** (not core).
- Document a reference integration pattern.

## Non-Goals

- No UI components in core.
- No framework coupling (React, Vue) inside llm-core core.
- No assumptions about host runtime (Node/Edge/Browser).

## Package Targets (proposed)

1. **@llm-core/adapter-vercel-ai**

   - Primary example.
   - Bridge `InteractionEvent` to AI SDK UI stream (e.g., `UIMessageChunk` or equivalent).
   - Provide `createVercelAiEventStream` and/or `createVercelAiInteractionSink`.

2. **@llm-core/adapter-openai-chatkit** (optional)

   - Secondary, optional due to evolving API.
   - Map InteractionState to ChatKit UI message structures.

3. **@llm-core/adapter-assistant-ui**

   - Bridge Interaction events into assistant-ui command protocol.
   - Focus on `assistant-transport` (`add-message`, `add-tool-result`) for command-driven UIs.

4. **Hosts (runtimes)** (optional)
   - `@llm-core/interaction-node` (SSE / WS / in-process)
   - `@llm-core/interaction-edge` (KV-backed sessions, Response streams)

## Design Sketch

### Adapter-side InteractionSink

```ts
export type InteractionSink = {
  onState?: (state: InteractionState) => void;
  onEvent?: (event: InteractionEvent) => void;
};

export function createVercelAiInteractionSink(stream: SomeUiSdkStream): InteractionSink {
  return {
    onEvent(event) {
      stream.append(mapEventToUiChunk(event));
    },
  };
}
```

### EventStream bridging

```ts
export function createVercelAiEventStream(stream: SomeUiSdkStream): EventStream {
  return {
    emit(event) {
      stream.append(mapEventToUiChunk(toInteractionEvent(event)));
      return true;
    },
  };
}
```

These live in adapter packages, not core.

## Step Plan

1. **Define adapter package structure**

   - Repo layout, build pipeline, exports.
   - Status: [x] complete

2. **Vercel AI SDK mapping**

   - Event mapping rules (InteractionEvent → UI chunk).
   - Support model delta, tool call, tool result, errors.
   - Status: [x] complete (plus assistant-ui command adapter)

3. **EventStream implementation**

   - Provide `EventStream` backed by AI SDK stream abstraction.
   - Ensure `MaybePromise` semantics.
   - Status: [x] complete

4. **OpenAI ChatKit adapter**

   - Map Interaction events to ChatKit DOM events.
   - Status: [x] complete

5. **Host transport examples**

   - Minimal Node SSE stream.
   - Minimal Edge/Worker stream.
   - Status: [x] complete

6. **Docs + examples**

   - Document adapter usage in `docs/interaction/transport.md` or a new page.
   - Provide one reference example app (outside core).
   - Status: [x] complete

7. **Additional Context follow-through**

   - [x] AI SDK `ChatTransport` helper (transport-first integration).
   - [x] Generic event-emitter adapter for DOM/event-based UI SDKs.
   - [x] NLUX adapter (`ChatAdapter` with `streamText`/`batchText` + context bridging).
   - [x] Unified start/delta/end/error lifecycle mapping in adapter core (borrow from unified-llm/mastra).
   - [x] Optional stream utilities (tee/toArray style) in host glue helpers.
   - Status: [x] complete

## Acceptance Criteria

- Core remains unchanged (headless, no UI).
- Vercel AI SDK adapter works with Interaction Core pipelines.
- Interaction events can be streamed to UI with deterministic ordering.
- Clear documentation on where UI logic lives (host land).

## Notes

- Prefer data-last APIs in adapter helpers.
- No user-facing generics outside Workflow.recipe.
