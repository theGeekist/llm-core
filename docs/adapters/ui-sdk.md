# UI SDK Adapters

UI SDK adapters connect Interaction Core to UI-facing streaming primitives while keeping UI frameworks out of the core package. They live in the adapters layer and map `InteractionEvent` values into UI SDK stream chunks or DOM-style events. Host code can then push updates into UI hooks, transports, or custom components.

These adapters use a `*-ui` suffix, for example `ai-sdk-ui`, to show that they target UI transport protocols rather than provider SDKs. They share the same adapter surface as the other integrations, so the API feels consistent across recipes and interactions.

## Quick start with AI SDK streams

::: tabs
== JavaScript

<<< @/snippets/adapters/ui-sdk.js#docs

:::

## AI SDK ChatTransport helper

If you already use `useChat`, you can plug in a transport that runs Interaction Core directly. The helper keeps the usual AI SDK ergonomics while the interaction runtime handles the conversation logic.

::: code-group
<<< @/snippets/adapters/ai-sdk-chat-transport.js#docs [JavaScript]
<<< @/snippets/adapters/ai-sdk-chat-transport.ts#docs [TypeScript]
:::

## Assistant UI transport

assistant-ui provides an `assistant-transport` command protocol. The adapter maps interaction model events to `add-message` and `add-tool-result` commands that fire when the model run completes. This fits command-driven runtimes that prefer a clear, structured stream of UI actions.

::: tabs
== JavaScript

<<< @/snippets/adapters/assistant-ui.js#docs

:::

For streaming behaviour, the AI SDK stream adapter `ai-sdk-ui` often works better. You can plug it into `@assistant-ui/react-ai-sdk`, which already turns AI SDK streams into assistant-ui commands.

## OpenAI ChatKit events

ChatKit exposes a DOM event interface. The adapter converts interaction events into `chatkit.*` events so you can feed a headless Interaction Core run into the ChatKit Web Component event stream.

::: tabs
== JavaScript

<<< @/snippets/adapters/openai-chatkit.js#docs

:::

A similar bridge works for any event-driven UI SDK. Use `createInteractionEventEmitterStream` with an event mapper that suits your own component model and event names.

## NLUX ChatAdapter

NLUX expects a `ChatAdapter` implementation that can either stream text or return a batch result. The adapter here wires Interaction Core into that contract so your NLUX chat components can consume the same interaction flows as the rest of the system.

::: code-group
<<< @/snippets/adapters/nlux-chat-adapter.js#docs [JavaScript]
<<< @/snippets/adapters/nlux-chat-adapter.ts#docs [TypeScript]
:::

## Mapping behaviour

The AI SDK adapter focuses on how streams behave rather than on how messages are constructed.

When an interaction event has kind `"model"`, the adapter turns it into `UIMessageChunk` parts. These parts cover text, reasoning segments, and tool activity so the UI can show intermediate work as it happens.

Events of type `trace`, `diagnostic`, `query`, and `event-stream` become `data-*` chunks. This keeps them visible for logging, debugging, and telemetry, while message text stays clean and user facing.

Message and part identifiers follow deterministic rules based on interaction metadata. Client code can resume a stream or merge multiple streams and still rely on stable identifiers.

When you need deterministic grouping across several events, use a shared mapper:

```js
import { createAiSdkInteractionMapper } from "#adapters";

const mapper = createAiSdkInteractionMapper({ messageId: "chat-1" });
// mapper.mapEvent(event) -> UIMessageChunk[]
```

## When to use these adapters

These adapters suit projects that want to stream Interaction Core output into `useChat` or other AI SDK transports and still keep the runtime independent from any specific UI library.

They also fit projects that use assistant-ui or similar UI packages. These tools already work with AI SDK streams and rely on a clear event or command protocol. The adapter turns Interaction Core events into that shape, so your UI code keeps using its usual hooks and components while the runtime focuses on reasoning, tools, and memory.

The general goal is to keep UI concerns inside adapter code while Interaction Core stays focused on orchestration, recipes, and interaction logic. That way you can evolve your UI stack, or support several UI stacks in parallel, while reusing the same interaction pipeline.
