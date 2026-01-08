# Stage 21 — UI SDK Adapters + Host Glue (Out-of-Core)

Status: in progress.

Purpose: add **first-class UI SDK adapters** and **host transport glue** without polluting core.
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

### Implications for Stage 21 design

- Define **agnostic adapter contracts** that support both:
  - **stream adapters** (`InteractionEvent` → UIMessageChunk/ReadableStream)
  - **event adapters** (`InteractionEvent` → DOM/custom events)
- Keep mapping rules explicit: text/reasoning/tool/data parts with deterministic ordering.
- Treat HITL/approval as first-class events (stream chunk or DOM event).

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

4. **Host glue** (optional)
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

5. **Host glue examples**

   - Minimal Node SSE stream.
   - Minimal Edge/Worker stream.
   - Status: [ ] pending

6. **Docs + examples**
   - Document adapter usage in `docs/interaction/transport.md` or a new page.
   - Provide one reference example app (outside core).
   - Status: [x] docs updated; [ ] example app pending

## Acceptance Criteria

- Core remains unchanged (headless, no UI).
- Vercel AI SDK adapter works with Interaction Core pipelines.
- Interaction events can be streamed to UI with deterministic ordering.
- Clear documentation on where UI logic lives (host land).

## Notes

- Prefer data-last APIs in adapter helpers.
- No user-facing generics outside Workflow.recipe.
