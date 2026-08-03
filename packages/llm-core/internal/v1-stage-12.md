# Stage 12: Cache Adapter & Session Persistence

Status: completed.

## Context

Resume sessions and execution state are **ephemeral** by nature—they require lifecycle management (TTL) to prevent memory leaks and ensure security (auto-expiration of tokens).

Our current `KVStore` and `Storage` adapters map to the ecosystem's **persistent** layers (e.g., `BaseStore`, `BaseKvStore`), which lack standard TTL support. This mismatch forces us to either leak memory or implement custom cleanup logic.

Investigation reveals that the ecosystem handles this via a distinct "Cache" layer:

- **LangChain/LangGraph**: Distinguishes between `BaseStore` (Persistence) and `BaseCache` (Generations/State). Crucially, the **LangGraph Checkpoint Cache** supports per-key TTL.
- **LlamaIndex**: Focuses on persistent KV/Doc stores, leaving ephemeral state to the implementing backend (Redis/SimpleKV).

## Goals

- **Standardize Ephemeral Storage**: Introduce a `Cache` adapter specifically for "Key-Value with TTL" semantics.
- **Align with Ecosystem**: Mirror the **LangGraph Checkpoint Cache** interface (`set(key, val, ttl)`), which is the standard for agentic state.
- **Dogfood Internally**: Refactor `resume.sessionStore` (currently an ad-hoc implementation) to use this standard `Cache` adapter, making session storage fully pluggable.

## Decisions

- **Rename Persistence → Cache**: We will use the term `Cache` to align with `BaseCache`.
- **Primitives**: Provide a robust `MemoryCache` with simulated TTL.
- **Zero-Config Defaults**: The runtime will automatically use a private `MemoryCache` instance if no `cache` adapter is provided by the user. This mirrors existing behavior and ensures the regular user API (`createRuntime`, `run`, `resume`) remains **unchanged**.
- **Ecosystem Adapters**: Implement `Cache` adapters for LangChain (wrapping their `BaseCache` where possible) and LlamaIndex (wrapping `KVStore` with potential no-op or custom TTL handling).

## Caveats

- **MemoryCache is in-process**: No persistence across restarts. It is intended for local/dev and simple single-process deployments.
- **TTL is best-effort**: Expiry is enforced on `get` (lazy cleanup). There is no background GC sweep unless the underlying cache provides one.
- **Session snapshots must be serializable**: Resume snapshots are stored as JSON; non-serializable payloads will be ignored.
- **Token types are strict**: Cache-backed session stores only accept string/number tokens.
- **TTL support is adapter-dependent**: Some ecosystem caches may ignore TTL or treat it as a hint; we do not enforce TTL beyond the cache implementation.

## Deliverables

1.  **Core Interface** (`src/adapters/types.ts`)

    - `Cache` type definition.
    - `AdapterBundle` update (`cache?: Cache`).

2.  **Primitive Implementation** (`src/adapters/primitives/cache.ts`)

    - `MemoryCache`: Map-based with expiry logic.
    - Unit tests (`tests/adapters/cache.test.ts`).

3.  **Ecosystem Implementations**

    - `src/adapters/langchain/cache.ts`: Wrap `BaseCache` (note: handle distinction between Core global-TTL and Checkpoint per-key TTL).
    - `src/adapters/llamaindex/cache.ts`: Wrap `BaseKVStore` (best effort mapping).

4.  **Resume Integration** (`src/workflow/runtime/resume-session.ts`)

    - Keep `SessionStore` interface pure.
    - Add `createSessionStoreFromCache(cache: Cache): SessionStore` bridge.
    - Update `resolveResumeSession` and `createSnapshotRecorder` to accept optional `store: SessionStore`.
    - **No** imports of `MemoryCache` or direct adapter logic.

5.  **Runtime Wiring**

    - `src/workflow/runtime.ts`: Expose `baseAdapters` in `declaredAdapters()` and pass to `run`/`resume` handlers.
    - `*_handler.ts`: Resolve `adapters.cache`, convert to `SessionStore` using helper, and inject into resume logic.

6.  **Refactoring**
    - Update `tests/workflow/runtime.test.ts` to use `MemoryCache` via plugins.
    - Register default `MemoryCache` in `hitl-gate` recipe.
