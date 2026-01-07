---
title: Sessions
---

# Interaction Sessions (Headless)

Sessions add persistence and policy hooks on top of Interaction Core without coupling to a host
runtime. They are adapter-driven: you supply a `SessionStore`, and core just orchestrates
load → run → policy → save.

---

## 1) Quick start (JS-only)

Use a store adapter (Redis, KV, memory, etc.) and call `send()`.

<<< @/snippets/interaction/session.js#docs

`send()` returns the interaction run outcome (sync or async), and `session.getState()` always
reflects the latest persisted state.

---

## 2) Policy hooks (merge → summarize → truncate)

If you need a retention or summarization strategy, inject a policy:

```js
const policy = {
  merge: (previous, next) => next,
  summarize: (state) => state,
  truncate: (state) => state,
};
```

All hooks are optional and run in this order. Core provides **no defaults**.

---

## 3) Notes

- Session identity is opaque (`SessionId`), and core never derives it.
- Concurrency for the same session is delegated to the store implementation.
- Everything stays `MaybePromise` (sync stays sync; async stays async).
- The optional `context` in session options is forwarded to the `SessionStore` for diagnostics or
  metadata.
- Paused outcomes skip policy/save hooks but still update in-memory session state from the paused
  snapshot.
