---
title: Interaction Transport
---

# Interaction Transport

The interaction transport is the narrow strip between the interaction pipeline and the outside world. It takes each interaction event from the pipeline and sends it to an `EventStream` adapter. This keeps UI adapters separate from pipeline details and makes it easy to plug in different runtimes or UIs.

---

## 1) Real world example: server sent events

Imagine you want to stream events to a browser through server sent events. The transport layer listens to the pipeline and writes each event into the response stream.

```js
// In your route handler
const stream = new PassThrough(); // Your output stream

await runInteractionPipeline({
  // ... input config ...
  transport: {
    // Forward events to the stream
    emit: (event) => stream.write(`data: ${JSON.stringify(event)}\n\n`),
  },
});
```

This simple pattern powers many real time chat interfaces and dashboards. The pipeline produces events, the transport pushes them into the stream, and the browser keeps a steady connection open to receive updates.

---

## 2) Emit interaction events through adapters

In real projects you usually pass in an `EventStream` adapter instead of writing directly to a stream. The adapter owns the actual input or output work and can target HTTP responses, WebSockets or any other transport.

The example below shows how to wire a transport adapter into a pipeline run.

<<< @/snippets/interaction/transport.js#docs

---

## 3) Event shape and consumers

During a run the interaction pipeline emits events such as messages, diagnostics and trace entries. Each event travels through the transport as an `EventStreamEvent` value, which adds a small envelope around the raw event. Different consumers focus on different parts of that stream.

| Event Name               | Typical Consumer                                                                |
| :----------------------- | :------------------------------------------------------------------------------ |
| `interaction.message`    | Chat UI. Renders text deltas and tool updates.                                  |
| `interaction.diagnostic` | Developer tools. Shows validation errors or warnings.                           |
| `interaction.trace`      | Observability tools. Sends trace spans to systems such as LangSmith or Datadog. |

This generic event shape makes it easy to send events to several destinations through `createEventStreamFanout`. A single run can feed logging, metrics, observability tools and a UI at the same time.

---

## 4) Host Transport

For concrete implementations on specific platforms such as Node, Edge and Workers see:

**[Host Transport](/interaction/host-transport)**
