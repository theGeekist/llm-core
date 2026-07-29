# Interaction

Interaction sessions coordinate conversation state with an `AgentRunner` and
project canonical events into UI-ready state.

```ts
import { createInteractionSession } from "@geekist/llm-core/interaction";
import { createAiSdkUiProjectionMapper } from "@geekist/llm-core/adapters/ai-sdk-ui";

const session = createInteractionSession({
  conversationId,
  agent,
  runner,
  store,
  identity: {
    now: () => new Date().toISOString(),
    newSnapshotId,
    newReservationId,
  },
});

const interactionRun = await session.send({
  input: { prompt: "hello" },
  invocationContext,
});

const project = createAiSdkUiProjectionMapper();
for await (const event of interactionRun.events()) {
  for (const chunk of project(event)) {
    await uiStream.write(chunk);
  }
}

const { snapshot, run: result } = await interactionRun.result();
```

The session lifecycle is load, atomically reserve the current conversation
revision, start the runner, reduce canonical events, then commit the next
snapshot. Reservation happens before execution; a post-execution compare-and-
swap is not sufficient. A failed commit never authorizes an automatic replay
of a meaningful effect.

`interactionRun.continuation` is process-local and can reconnect to the same
live connection through `session.reconnect()`. The returned `snapshot` is a
portable point-in-time conversation value, not a resumable workflow
checkpoint. Provider continuity remains an opaque `ProviderSessionRef`.

UI integrations consume projection events; they do not become an execution,
receipt or persistence authority. Projected tool input and results must
already be safe, redacted JSON.

Qualified UI fronts are available for AI SDK UI, assistant-ui, OpenAI ChatKit,
and NLUX. Each maps canonical interaction events into the target UI protocol.
