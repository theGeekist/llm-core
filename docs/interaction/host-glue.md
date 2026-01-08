---
title: Interaction Host Glue
---

# Interaction Host Glue

Interaction Core is headless by design, so host runtimes (Node, Workers, Edge) provide the glue
that turns `EventStreamEvent` into real transports like SSE. The goal is to keep the glue small,
deterministic, and adapter-driven.

---

## 1) Node SSE (ServerResponse)

This pattern maps interaction events to SSE chunks without introducing any UI dependency.

<<< @/snippets/interaction/host-node.js#docs

---

## 2) Edge / Worker streams

On the edge you typically have a writer that accepts string chunks (e.g. from a `TransformStream`
or platform-specific stream), which can be wrapped as an `EventStream`.

<<< @/snippets/interaction/host-edge.ts#docs

---

## 3) Example app (outside core)

There is a minimal Node SSE demo app outside core at:

- `examples/interaction-node-sse`

It is intentionally tiny and uses the built-in model so you can run it without external APIs.
