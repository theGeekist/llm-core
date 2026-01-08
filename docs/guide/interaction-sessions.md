---
title: Sessions + Transport
---

# Sessions + Transport (Multi-Turn)

This guide adds **sessions** and **host transport** to the interaction loop. You get persistence,
policy hooks, and streaming events to a client—all without changing the core interaction logic.

---

## 1) Working demo

<<< @/snippets/interaction/host-node.js#docs

What you get:

- A durable session boundary (`sessionId`).
- Pluggable storage (`SessionStore`) and optional policies.
- Streaming interaction events over SSE (or any `EventStream`).

---

## 2) Options and interoperability

### Swap storage without changing your app

```js
// Redis, KV, DB, or in-memory — you implement the same interface.
const store = {
  load(sessionId) {
    return redis.get(toKey(sessionId));
  },
  save(sessionId, state) {
    return redis.set(toKey(sessionId), state);
  },
};
```

### Add policies for summarization or truncation

```js
const policy = {
  summarize(state) {
    return summarizeState(state);
  },
  truncate(state) {
    return truncateHistory(state, 50);
  },
};
```

### Swap transports (SSE ↔ WebSocket ↔ Worker stream)

You can emit `EventStreamEvent` over any transport. The interaction layer doesn't care.

For more host patterns, see:

- [Host Glue](/interaction/host-glue)

---

## 3) Why this is better than ad-hoc sessions

- **Headless orchestration**: storage and policy are adapters, not globals.
- **Deterministic streaming**: every event is ordered and shaped consistently.
- **UI-agnostic**: you can stream to any UI SDK via adapters.

---

## Next step

When you need multi-step orchestration (RAG, tools, HITL), move to full workflows:

- [Workflow Orchestration](/guide/hello-world)
