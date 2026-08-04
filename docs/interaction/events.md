# Events and projections

Interaction keeps evidence, agent lifecycle, and presentation content distinct.
The `InteractionEvent` wrapper gives them one ordered reduction surface without
pretending they are the same event type.

<<< @/snippets/v2/interaction-events.ts

## Canonical input families

| Wrapper kind     | Canonical source          | Typical projection                                              |
| ---------------- | ------------------------- | --------------------------------------------------------------- |
| `agent-run`      | `AgentEvent`              | Run status, progress, intervention, cancellation                |
| `tool-execution` | `ToolExecutionEvent`      | Tool receipt status and safe reason code                        |
| `content`        | `InteractionContentEvent` | Message, text, reasoning, tool-call, and tool-result UI content |

`interactionAgentEvent`, `interactionExecutionEvent`, and
`interactionContentEvent` copy only the permitted facts into portable,
deep-frozen values.

## Registered content

Create content events with `registerInteractionContentEvent` before emitting
them through a session. Registration enforces:

- canonical event and run identities;
- a canonical timestamp and non-negative sequence;
- a closed content-event kind and facts shape;
- explicit redaction metadata;
- safe JSON for projected tool input and results.

The projection rejects obvious sensitive field names such as access tokens,
credentials, passwords, secrets, signed URLs, and authorization data. The host
still owns semantic redaction of opaque strings before registration.

## Deterministic reduction

`reduceInteractionProjection` enforces the lifecycle rather than merely
appending values:

1. conversation identity must match;
2. an event ID may repeat only with identical facts;
3. sequences increase within their event family key;
4. messages start once and close once;
5. tool results follow their tool call;
6. no event follows a terminal run.

`projectInteractionEvent` returns `null` for canonical lifecycle events that do
not need a UI representation. This keeps the canonical log richer than any one
presentation protocol.

## Projection is not evidence

A `ConversationEvent` is a deterministic view. It is useful for interfaces
and stored conversation projections, but it does not replace the canonical
`ToolExecutionEvent`, a durable receipt, or the terminal `AgentResult`.

An `InteractionSession` can expose projected conversation events while an
explicit runtime integration supplies canonical run events. Raw
`InteractionEvent` values, registration helpers, and reducers remain extension
APIs for runtime and adapter authors.
