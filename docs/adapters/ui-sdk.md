# UI SDK Adapters

UI SDK adapters bridge Interaction Core into UI-facing streaming primitives without pulling any UI
framework into core. They live in adapters and map `InteractionEvent` into UI SDK stream chunks or
DOM-style events so host code can push updates to UI hooks, transports, or custom components.

These adapters follow a `*-ui` suffix (for example, `ai-sdk-ui`) to signal that they target UI
transport protocols rather than provider SDKs. They still sit in the same adapters surface so the
API stays consistent across recipes and interactions.

## Quick start (AI SDK stream)

::: tabs
== JavaScript

<<< @/snippets/adapters/ui-sdk.js#docs

:::

## AI SDK ChatTransport helper

If you are already using `useChat`, you can plug in a transport that runs Interaction Core
directly instead of a bespoke HTTP handler.

::: code-group
<<< @/snippets/adapters/ai-sdk-chat-transport.js#docs [JavaScript]
<<< @/snippets/adapters/ai-sdk-chat-transport.ts#docs [TypeScript]
:::

## Assistant UI transport

assistant-ui offers an `assistant-transport` command protocol. The adapter maps interaction model
events to `add-message` and `add-tool-result` commands (emitted on model end), which is a good fit
for command-driven runtimes.

::: tabs
== JavaScript

<<< @/snippets/adapters/assistant-ui.js#docs

:::

If you want streaming UI behavior, prefer the AI SDK stream adapter (`ai-sdk-ui`) and plug it into
`@assistant-ui/react-ai-sdk`, which already bridges AI SDK streams into assistant-ui.

## OpenAI ChatKit events

ChatKit exposes a DOM event interface. The adapter maps interaction events into `chatkit.*` events
so you can bridge a headless Interaction Core run into the ChatKit Web Component event stream.

::: tabs
== JavaScript

<<< @/snippets/adapters/openai-chatkit.js#docs

:::

If you are working with another event-driven UI SDK, you can build a similar bridge by using
`createInteractionEventEmitterStream` with your own event mapper.

## NLUX ChatAdapter

NLUX expects a `ChatAdapter` that can stream text or return a batch result. The adapter below
bridges Interaction Core into that contract.

::: code-group
<<< @/snippets/adapters/nlux-chat-adapter.js#docs [JavaScript]
<<< @/snippets/adapters/nlux-chat-adapter.ts#docs [TypeScript]
:::

## Mapping behavior

The AI SDK adapter focuses on streaming semantics rather than message construction:

- `InteractionEvent.kind === "model"` maps to `UIMessageChunk` parts (text, reasoning, tools).
- `trace`, `diagnostic`, `query`, and `event-stream` map to `data-*` chunks so they remain
  observable without contaminating message text.
- Message and part identifiers are deterministic (derived from interaction metadata) so clients can
  resume or merge streams.

If you need deterministic grouping across multiple events, reuse a shared mapper:

```js
import { createAiSdkInteractionMapper } from "#adapters";

const mapper = createAiSdkInteractionMapper({ messageId: "chat-1" });
// mapper.mapEvent(event) -> UIMessageChunk[]
```

## When to use

Use these adapters when you want to:

- stream Interaction Core output into `useChat` or AI SDK transports,
- integrate with assistant-ui or other UI packages that already consume AI SDK streams,
- keep UI concerns out of your runtime while still offering a first-class UI story.
