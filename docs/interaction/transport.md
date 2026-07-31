# Reconnect and transport

Interaction has two separate continuity mechanisms:

| Mechanism                                     | Lifetime                  | Purpose                                            |
| --------------------------------------------- | ------------------------- | -------------------------------------------------- |
| `LiveContinuation<InteractionLiveConnection>` | Process-local             | Reattach to the same active interaction connection |
| `ConversationSnapshot`                        | Portable and store-backed | Load completed conversation state for a later run  |

Neither is a workflow checkpoint. A provider session, when available, remains
an opaque `ProviderSessionRef` and is passed only to a runner that declares
provider-session continuation.

## Reconnect to a live interaction

`InteractionRun.continuation` captures the live connection. Pass it to
`session.reconnect()` for another reader in the same process. The session
rejects unregistered continuations and continuations from another conversation.

This API does not serialize a socket, promise, event iterator, or runtime
object. If the process disappears, load the stored conversation snapshot and
start a new run according to your application policy.

## AI SDK UI WebSocket transport

The qualified AI SDK UI adapter includes a `ChatTransport` implementation for a
closed WebSocket protocol.

<<< @/snippets/v2/interaction-transport.ts

The client sends:

- redacted observable `auth.set` messages for each host-supplied token;
- one `chat.send` message containing the request identity, chat identity,
  messages, and optional provider/model selection.

The server may return only a validated subset of AI SDK UI chunks. Unknown
messages, mismatched request identities, provider metadata, arbitrary data
chunks, and unsafe tool payloads are ignored. Abort, socket failure, and
protocol error finalize the stream exactly once.

`reconnectToStream()` returns `null`. WebSocket stream recovery is therefore a
host concern and must not be confused with
`InteractionSession.reconnect()`.

## Keep transport at the edge

Transport moves already-projected values. It does not authorize tools, create
receipts, persist conversation state, or establish runtime portability. Build
those guarantees on the corresponding control, evidence, session, and
conformance contracts.
