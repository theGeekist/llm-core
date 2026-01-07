---
title: Interaction Reducer
---

# Interaction Reducer

The reducer is a pure function that consumes `InteractionEvent` instances and produces a new
`InteractionState`. It is deterministic, idempotent by sequence, and safe for UI usage.

---

## 1) Model stream → assistant message

`ModelStreamEvent` events are assembled into a single assistant message. Deltas become `parts` when
reasoning/tool calls/results are present. Source payloads (when supplied) are preserved as `data`
parts.

---

## 2) Query stream → tool message

`QueryStreamEvent` events assemble into tool messages that include `data` parts for sources.

---

## 3) Example reduction (TypeScript)

This shows a minimal event list reduced into state. Note that `events: []` enables event capture.

<<< @/snippets/interaction/reducer.ts#docs

---

## 4) Private raw payloads

- Usage events are stored under `private.raw["<sourceId>:usage"]`.
- Stream errors go under `private.raw["<sourceId>:error"]`.
- Stream raw payloads are stored under `private.raw["<sourceId>:raw"]` (last write wins).
- Query raw payloads go under `private.raw["<sourceId>:raw"]`.

This keeps UI messages clean while preserving provider detail for debugging.

---

## 5) Stream keying and error policy

- Stream assemblies are keyed by `correlationId + sourceId` when a correlation id is present.
  This prevents model and query streams from colliding when a single correlation id spans the
  interaction.
- Error events flush any buffered content into a partial message, then clear the stream and record
  diagnostics. This preserves partial output while still surfacing failure details.
