---
title: Interaction Transport
---

# Interaction Transport

Interaction events can be forwarded to any `EventStream` adapter. This keeps UI adapters decoupled
from the pipeline itself.

---

## 1) Emit interaction events

Pass an `eventStream` to `runInteractionPipeline(...)` and events are emitted as they are reduced.

<<< @/snippets/interaction/transport.js#docs

---

## 2) Event shape

Interaction events are wrapped as `EventStreamEvent` payloads:

- `name`: `interaction.<kind>`
- `data.event`: the original `InteractionEvent`

This keeps the transport generic and makes it easy to route in UI adapters.

If you need concrete host transport (SSE on Node or edge streams), see:

- [Host Transport](/interaction/host-transport)
