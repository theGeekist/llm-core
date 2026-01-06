# Stage 19 — Interaction Core (Pipeline-Backed)

Status: complete.

Goal: Introduce a runtime-agnostic interaction layer that can run on `@wpkernel/pipeline` while
reusing existing adapter, trace, diagnostics, and streaming constructs. This is a projection and
coordination layer, not a new runtime.

## Principles

- Runtime-agnostic: pipeline-powered, no dependency on workflow runtime/recipes.
- Deterministic ordering: stable event IDs and explicit ordering metadata.
- Diagnostics + trace always present.
- Minimal surface area: small set of types + reducer + pipeline helpers.
- Data-last APIs and no user-facing generics (except `Workflow.recipe(...)`).

## Mapping to Existing Constructs

- Trace + diagnostics are already normalized and append-only.
  - Trace: `src/workflow/trace.ts`
  - Diagnostics: `src/workflow/diagnostics.ts`
- Adapter streaming is normalized for model and retrieval calls.
  - Model stream: `src/adapters/types/model.ts` (`ModelStreamEvent`)
  - Query stream: `src/adapters/types/engines.ts` (`QueryStreamEvent`)
- EventStream already exists as a transport primitive.
  - `src/adapters/types/orchestration.ts`
  - `src/adapters/primitives/event-stream.ts`
- Pause/resume is now available in the pipeline core (`makeResumablePipeline`), and epipe already
  maps pipeline pause snapshots in workflow runtime.

## AI SDK Parity Notes (existing adapter coverage)

- AI SDK `TextStreamPart` is already normalized into our `ModelStreamEvent` in
  `src/adapters/ai-sdk/stream-utils.ts` and `src/adapters/ai-sdk/stream.ts`.
  - Handles text/reasoning start + delta + end.
  - Handles tool call + tool result + tool error.
  - Unknown parts are preserved under `raw` in a `delta` event.
- `fromAiSdkModel` in `src/adapters/ai-sdk/model.ts` emits `ModelStreamEvent` from `streamText`,
  so interaction-core can remain adapter-agnostic and consume our normalized stream types.
- Interaction-core should not reintroduce AI SDK UI protocol, but may optionally map
  `InteractionEvent` to an AI SDK-like `UIMessageChunk` for UI adapters if needed later.

## What This Stage Adds

### 1) InteractionEvent (new)

Create a unified event envelope that wraps existing event sources without inventing new shapes.
This is a typed protocol for UI adapters and reducers.

```ts
export type InteractionEvent =
  | { kind: "trace"; event: TraceEvent; meta: InteractionEventMeta }
  | { kind: "diagnostic"; entry: DiagnosticEntry; meta: InteractionEventMeta }
  | { kind: "model"; event: ModelStreamEvent; meta: InteractionEventMeta }
  | { kind: "query"; event: QueryStreamEvent; meta: InteractionEventMeta }
  | { kind: "event-stream"; event: EventStreamEvent; meta: InteractionEventMeta };
```

`InteractionEventMeta` is the deterministic merge key. Keep it minimal but explicit:

```ts
export type InteractionEventMeta = {
  /** Monotonic within a single interaction; assigned by the interaction pipeline. */
  sequence: number;
  /** Wall-clock timestamp in ms for UX/diagnostics. */
  timestamp: number;
  /** Stable identifier of the logical source stream. */
  sourceId: string;
  /** Optional correlation key across related events (turn, message, tool call). */
  correlationId?: string;
  /** Optional interaction id if multiple conversations are multiplexed. */
  interactionId?: string;
};
```

### 2) InteractionState (new)

A serializable projection that is safe for UI consumption and can be persisted.

```ts
export type InteractionState = {
  messages: Message[];
  diagnostics: DiagnosticEntry[];
  trace: TraceEvent[];
  events?: InteractionEvent[];
  /** Last processed sequence; enables resume + idempotent reduction. */
  lastSequence?: number;
  private?: {
    /** Provider-specific raw payloads, safe to persist but not to render. */
    raw?: Record<string, unknown>;
    /**
     * In-flight assembly buffers for streaming messages.
     * Keep serialisable, but opaque to consumers.
     */
    streams?: Record<string, unknown>;
  };
};
```

Notes:

- `messages` uses existing normalized message types.
- `diagnostics` and `trace` are append-only.
- `private.raw` is for provider-specific raw data that should not leak to UI.

### 3) Reducer + Projection Utilities (new)

Pure functions that reduce any `InteractionEvent[]` into `InteractionState`. This is the main
interaction “core” behavior and must stay runtime-agnostic.

```ts
export type InteractionReducer = (
  state: InteractionState,
  event: InteractionEvent,
) => InteractionState;
```

Requirements:

- Deterministic ordering (stable sequence IDs, no reliance on arrival order).
- Public vs private separation (no raw content leaked into `messages`).
- Must accept model/query streaming events and reduce them into message parts.
- Streaming assembly should live in `private.streams`; final messages commit on end events.

### 4) InteractionPipeline (new)

Define a pipeline that runs directly on adapters and yields `InteractionState` snapshots.

Suggested steps:

- `captureInput` — append a user message into state (optionally emit an interaction event).
- `runModel` — call `Model`, stream events, reduce into message deltas.
- `runTools` — optional tool execution, add tool messages/results to state.
- `postProcess` — optional summarization or RAG citation binding.
- `emitEvents` — push `InteractionEvent` into `EventStream`.

The pipeline uses `makeResumablePipeline` to support pause/resume. Pause snapshots must store
`InteractionState` so the pipeline can resume without the workflow runtime. Sequence assignment
should resume from `state.lastSequence ?? 0`.

### 5) Transport Boundary (new)

Define a UI adapter contract that consumes:

- `InteractionState` snapshots,
- `InteractionEvent` stream, and
- optional `EventStream` adapter for push delivery.

This is framework-agnostic glue. It should not encode React/Vue/etc semantics.
Keep the surface minimal, e.g. an `InteractionSink` with `onState` and `onEvent` callbacks.

## File Map (Proposed)

- `src/interaction/types.ts` — `InteractionEvent`, `InteractionState`, metadata types.
- `src/interaction/reducer.ts` — pure reducer + helpers.
- `src/interaction/pipeline.ts` — pipeline builder using adapters + reducer.
- `src/interaction/transport.ts` — EventStream bindings.
- `src/interaction/index.ts` — exports.
- `index.ts` — re-export interaction module at the top-level (optional; confirm).

## Implementation Steps

- [x] Add `InteractionEvent` and `InteractionState` types.
- [x] Implement reducer utilities with deterministic event ordering.
- [x] Map ModelStreamEvent and QueryStreamEvent into message deltas.
- [x] Add EventStream transport adapter helpers.
- [x] Build `createInteractionPipeline` using `makeResumablePipeline`.
- [x] Add pause/resume tests for pipeline-backed interaction flows.
- [x] Add unit tests for reducers and stream projection.
- [x] Add docs: interaction core overview and minimal example.

## Next Stages

- Session orchestration moves to Stage 20 with adapter-driven `SessionStore` + optional
  `SessionPolicy` (no defaults). `send()` returns the post-policy state in the artifact; state is
  derived via `getState()`. Concurrency for the same `sessionId` is delegated to the store.
- UI SDK adapters and host glue live out of core in Stage 21.

## Non-Goals

- No new runtime; this is pipeline-backed.
- No UI framework bindings.
- No adapter behavior changes; use existing adapter types.

## Risks

- Event ordering must remain deterministic across multiple streams.
- Streaming adapters must not leak raw payloads into UI state.
- Pause/resume snapshots must remain forward compatible as state evolves.

## Testing

- Reducer unit tests for model stream, query stream, tool results, diagnostics.
- Reducer tests for sequence-based idempotency + ordering.
- Pipeline tests for pause/resume + rollback with interaction state snapshots (pending).
- Transport tests for EventStream event delivery ordering and multi-source merge.
