---
title: Interaction Host Transport
---

# Interaction Host Transport

Typically, you use **[Interaction Transport](/interaction/transport)** to define _what_ events to send. **Host Transport** defines _how_ to send them over specific protocols like Server-Sent Events (SSE) or WebSockets.

**The Pattern**: Host transport takes the generic events from Interaction Transport and wires them into specific delivery channels. You keep the same event names and payloads and only swap out the host adapter.

---

## 1) Node SSE (ServerResponse)

This pattern maps interaction events to SSE chunks without introducing any UI dependency.

<<< @/snippets/interaction/host-node.js#docs

---

## 2) Edge / Worker streams

On the edge you typically have a writer that accepts string chunks (e.g. from a `TransformStream` or platform-specific stream), which can be wrapped as an `EventStream`.

<<< @/snippets/interaction/host-edge.ts#docs

---

## 3) Example app (outside core)

There is a minimal Node SSE demo app outside core at:

- `examples/interaction-node-sse`

It is intentionally tiny and uses the built-in model so you can run it without external APIs.
