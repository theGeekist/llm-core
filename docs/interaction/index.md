# Conversations and interaction

Conversation state, snapshots, stores, and projected events are portable
contracts. Execution is explicit through `InteractionSession`, which requires a
prepared definition and an injected `AgentRunner`.

<<< @/snippets/v2/conversation.ts

<<< @/snippets/v2/interaction-projection.ts

The session never constructs a runner. It reserves conversation state before
execution, sends work through the supplied adapter, reduces normalized events,
and persists the resulting snapshot.

A `ConversationSnapshot` is not a resumable runtime checkpoint. Provider
continuity remains an opaque `ProviderSessionRef`, and live reconnection remains
process-local.
