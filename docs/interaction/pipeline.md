---
title: Pipeline & Reducer
---

# Interaction Handle

The interaction handle runs steps such as models and tools and projects their events into UI-ready `InteractionState`.

`createInteractionHandle()` is the public boundary. The pipeline and reducer behind it remain implementation details, so application code can configure, compose, and run interactions without owning kernel state.

---

## 1) Running an interaction

The handle ships with a core pack of steps that covers the common chat loop.

### Default steps

`createInteractionHandle()` includes the core pack.

- `capture-input` normalises the user input message and turns it into a consistent internal shape.
- `run-model` calls the model adapter and streams events while tokens arrive.
- `run-tools` executes tool calls when the model asks for them and feeds the results back into the loop.

This gives you a complete interaction flow from user text to model response and tools, without any UI concerns mixed into the pipeline.

### Customising the interaction

You can insert your own steps when you want extra behaviour such as post processing, moderation, logging, or custom telemetry.

For example, a pack can register a step that inspects each assistant reply and adds safety flags into the trace, or a step that records timing metrics for the current run.

<<< @/snippets/interaction/custom-pack.js#docs

---

## 2) How events turn into InteractionState

The internal reducer is a pure function. It receives `InteractionEvent` values and folds them into an `InteractionState` object. The same events always produce the same state.

### Model stream to assistant message

`ModelStreamEvent` values are assembled into a single assistant message. Text deltas are appended to the last assistant message, and tool calls are aggregated into `parts` so that the UI can render a structured reply instead of a raw stream.

### Query stream to tool message

`QueryStreamEvent` values become tool messages. Source payloads from retrieval stay attached as `data` parts, which makes it easy to render citations, source previews, or debugging views.

### Capturing events

Ask the handle to capture events when you need replay, inspection, or debugging data alongside the projected state.

<<< @/snippets/interaction/reducer.ts#docs

---

## 3) Story of a single message

When a user sends a message, it flows through the system in a clear sequence.

1. **Input**: your code calls `run({ input: "Hello" })`.
2. **Interaction**: the `capture-input` step normalises the user input into a consistent message shape. The `run-model` step calls the LLM and emits `interaction.model` events.
3. **Transport**: each event travels over the wire, for example through SSE, to the client.
4. **Projection**: the interaction reducer folds events into state.
5. **State**: the reducer updates `state.messages` as each event arrives, and the UI renders the new state in real time.

This story holds even when tools, retrieval, or more advanced recipes become part of the flow, because they still emit events that follow the same reduction rules.

---

## 4) Sequencing and replay

Every `InteractionEvent` carries a `meta.sequence` value. The reducer uses this sequence number to enforce deterministic ordering.

- **Deduplication**: when two events share the same sequence value, the extra one is ignored.
- **Ordering**: events are processed in sequence order so late arrivals do not shuffle the state.

With this in place you can replay a full event history and reconstruct the exact state of a conversation at any point in time. This is useful for:

- **Resuming sessions** at specific checkpoints.
- **Audit logs** that prove exactly which messages the user saw.
- **Debugging** where you re run a reduction to reproduce a UI issue.

---

## 5) Troubleshooting

If the interaction state looks surprising, for example when a message seems incomplete or duplicated, you can follow a simple checklist.

- **Trace**: look at `state.trace` to see which events the model adapter emitted during the run.
- **Diagnostics**: inspect `state.diagnostics` for validation errors when an adapter returns malformed data.
- **Raw provider data**: read `state.private.raw` for the raw provider payloads. If an event feels missing from the user facing state, the underlying data often remains available here for inspection.

Most issues then become questions of “which events arrived” and “how they were projected”, rather than mysterious UI behaviour.
