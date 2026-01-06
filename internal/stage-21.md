# Stage 21 — UI SDK Adapters + Host Glue (Out-of-Core)

Status: planned.

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

3. **Host glue** (optional)
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
   - Status: [ ] pending

2. **Vercel AI SDK mapping**

   - Event mapping rules (InteractionEvent → UI chunk).
   - Support model delta, tool call, tool result, errors.
   - Status: [ ] pending

3. **EventStream implementation**

   - Provide `EventStream` backed by AI SDK stream abstraction.
   - Ensure `MaybePromise` semantics.
   - Status: [ ] pending

4. **Optional ChatKit adapter**

   - Map InteractionState to ChatKit UI state shape.
   - Status: [ ] pending

5. **Host glue examples**

   - Minimal Node SSE stream.
   - Minimal Edge/Worker stream.
   - Status: [ ] pending

6. **Docs + examples**
   - Document adapter usage in `docs/interaction/transport.md` or a new page.
   - Provide one reference example app (outside core).
   - Status: [ ] pending

## Acceptance Criteria

- Core remains unchanged (headless, no UI).
- Vercel AI SDK adapter works with Interaction Core pipelines.
- Interaction events can be streamed to UI with deterministic ordering.
- Clear documentation on where UI logic lives (host land).

## Notes

- Prefer data-last APIs in adapter helpers.
- No user-facing generics outside Workflow.recipe.
