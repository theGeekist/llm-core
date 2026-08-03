# Interaction sessions

`createInteractionSession` coordinates portable conversation state around an
explicit `AgentRunner`. The host supplies:

- a conversation identity;
- a prepared agent definition;
- the concrete runner integration;
- a reservation-capable `ConversationStore`;
- identity allocation; and
- an execution-event sink.

The reservation occurs before runner execution. This prevents a post-execution
optimistic conflict from making a consequential effect safe to repeat.

There is no convenience `createConversation` that selects a hidden local
runner. Applications may wrap `InteractionSession` in their own product API
without widening the kernel.
