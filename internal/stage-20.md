# Stage 20 — Interaction Sessions (Core)

Status: complete.

Purpose: introduce a **session orchestration layer** on top of Interaction Core without coupling to
host runtimes (Node/Edge/Browser) or UI frameworks. This is a headless, adapter-driven layer that
owns session identity, persistence, and merge policy—while keeping Interaction Core as a pure
projection engine.

This stage encodes the decisions from the Interaction/Recipe layering discussion:

- Interaction Core = projection layer for a single turn.
- Session = small orchestration wrapper around Interaction Core.
- Storage is adapter-driven (SessionStore); policies are injected, not baked in.
- Core never decides session identity; it only accepts an opaque `sessionId` (string or structured).
- Everything remains `MaybePromise` (sync/async agnostic).

## Context Summary (from design discussion)

We clarified four layers:

1. **Primitives** — shared language: Message, ModelStreamEvent, QueryStreamEvent, EventStream,
   Diagnostics, TraceEvent, MaybePromise.
2. **Pipeline core** — deterministic execution (makeResumablePipeline, helper DAG, rollback).
3. **Domain runtimes** — Workflow runtime (recipes) and Interaction Core (projection runtime).
4. **Host runtime** — Node/Bun/Edge/Browser; UI frameworks and HTTP live here.

We also agreed:

- Recipes should not include interaction dynamics directly.
- Interaction Core remains headless and UI-agnostic.
- A session facade belongs in core if it is adapter-driven (SessionStore) and policy-injected.

## Goals

- Add a **SessionStore** adapter contract (load/save) for interaction sessions (no defaults).
- Add an optional **SessionPolicy** contract for merge/truncate/summarize logic.
- Add a **createInteractionSession** API that orchestrates:
  - loading prior state by `sessionId`,
  - running the interaction pipeline for a new message,
  - merging and persisting state using policy hooks.
- Preserve deterministic event ordering and `MaybePromise` semantics.

## Non-Goals

- No UI framework bindings (React, Vue, etc.).
- No host runtime transport (SSE/WS/HTTP).
- No default persistence or summarization policies.
- No direct coupling to recipe/workflow runtime.

## Design Sketch

### Session identity (opaque)

Core accepts only an opaque ID:

```ts
type SessionId = string | { sessionId: string; userId?: string };
```

Core never derives IDs or enforces semantics (thread, user, tenant). Host code supplies it.

### SessionStore adapter (new)

```ts
export type SessionStore = {
  load: (
    sessionId: SessionId,
    context?: AdapterCallContext,
  ) => MaybePromise<InteractionState | null>;
  save: (
    sessionId: SessionId,
    state: InteractionState,
    context?: AdapterCallContext,
  ) => MaybePromise<boolean | null>;
  delete?: (sessionId: SessionId, context?: AdapterCallContext) => MaybePromise<boolean | null>;
};
```

- Storage is adapter-driven per environment (Redis, KV, memory). Core provides no defaults.
- Returns `true | false | null` for effects; no `undefined`.

### SessionPolicy (optional)

```ts
export type SessionPolicy = {
  merge?: (
    previous: InteractionState | null,
    next: InteractionState,
  ) => MaybePromise<InteractionState>;
  summarize?: (state: InteractionState) => MaybePromise<InteractionState>;
  truncate?: (state: InteractionState) => MaybePromise<InteractionState>;
};
```

Policy is injected; core never chooses it and never provides defaults.

### Session orchestration (core API)

```ts
export type InteractionSession = {
  getState: () => InteractionState;
  send: (message: Message) => MaybePromise<InteractionRunOutcome>;
  save?: () => MaybePromise<boolean | null>;
};

export function createInteractionSession(options: {
  sessionId: SessionId;
  store: SessionStore;
  adapters: AdapterBundle;
  reducer?: InteractionReducer;
  eventStream?: EventStream;
  policy?: SessionPolicy;
}): InteractionSession;
```

Behavior:

- Load initial state from `store.load(sessionId)`; if missing, start empty.
- Run interaction pipeline with `{ input: { message, state } }`.
- Apply policy hooks in order: `merge` → `summarize` → `truncate` (all optional).
- Persist via `store.save`.
- Keep `MaybePromise` end-to-end.
- `send()` returns the run outcome and updates the artefact for non-paused outcomes with the
  post-policy state.

### Concurrency

Core does not serialize concurrent sends. Concurrency control is delegated to the SessionStore
implementation (e.g., optimistic locking, compare-and-swap, per-session queueing).

## Step Plan

1. **SessionStore contract + types**

   - Add `SessionId`, `SessionStore`, `SessionPolicy`, `InteractionSession` types.
   - Location: `src/interaction/types.ts` (or a new `src/interaction/session.ts`).
   - Status: [x] complete

2. **Session orchestration helpers**

   - Implement `loadSessionState`, `saveSessionState`, and `applySessionPolicy` helpers.
   - Must be module-scope functions (no nested definitions).
   - Status: [x] complete

3. **createInteractionSession API**

   - Provide a simple facade that wraps `runInteractionPipeline`.
   - Ensure `send()` respects `MaybePromise` and preserves sync when possible.
   - Status: [x] complete

4. **In-memory SessionStore (testing)**

   - Add a test-only store implementation (map-backed).
   - Status: [x] complete

5. **Unit tests**

   - Session load, send, save.
   - Policy merge/summarize/truncate order.
   - Sync preservation tests.
   - Status: [x] complete

6. **Docs (interaction section)**
   - New page: `docs/interaction/session.md` with simple → advanced usage.
   - Explain adapter-driven storage and policy injection.
   - Status: [x] complete

## Acceptance Criteria

- Session orchestration works with sync or async adapters.
- Storage is entirely adapter-driven; no host assumptions.
- Policies are optional and injected, not defaults.
- No UI or transport coupling in core.
- Concurrency for a given `sessionId` is delegated to the store implementation.

## Notes

- Keep session IDs opaque and unvalidated.
- Do not add “sync-only” API variants.
- Effects must return `true | false | null` (no `undefined`).
