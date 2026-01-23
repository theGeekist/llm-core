---
title: Interaction Core
mermaid: true
---

# Interaction Core

Interaction Core is the engine for chat-like interfaces. It sits between your adapters and your UI, turning streaming data into stable, renderable state.

It works across Node, Edge, and browser runtimes and provides a predictable loop: **Input → Pipeline → Events → Reducer → State**.

---

## Mental Map

| Concept                                           | Role                                                         |
| :------------------------------------------------ | :----------------------------------------------------------- |
| **[Pipeline & Reducer](/interaction/pipeline)**   | Runs the steps (model, tools) and reduces events into state. |
| **[Sessions](/interaction/session)**              | Adds persistence (save/load) and long-term history policies. |
| **[Transport](/interaction/transport)**           | A generic layer for moving events from server to client.     |
| **[Host Transport](/interaction/host-transport)** | Concrete wiring for SSE, WebSockets, or Edge streams.        |

### Typical Stack

```mermaid
flowchart LR
    Adapter[Model Adapter] --> Pipeline
    Pipeline -->|Events| Transport[Transport (SSE)]
    Transport -->|Events| Reducer
    Reducer -->|state.messages| UI[React / UI]

    subgraph Server
    Pipeline
    end

    subgraph Client
    Reducer
    UI
    end
```

---

## What role does it play?

Adapters provide raw capabilities such as models and tools. Recipes orchestrate the logic, including agents and retrieval-augmented generation. Interaction Core provides the glue that turns this into something a user can interact with on screen.

It takes care of three everyday concerns when you build a chat app.

Streaming handles the flow of token deltas and turns them into coherent messages that a UI can render.

State tracks tool calls, intermediate results, and loading indicators so the interface stays in sync with the work happening inside your adapters.

History manages sessions over time, including how conversations are persisted and how they can be resumed later.

## Server-side Helpers

When you build a chat API, you often need to resolve a recipe, select a model, and run the pipeline in one go. `runInteractionRequest` standardises this flow and lets you pass adapter overrides (for example, tools or retrievers) while emitting diagnostics into the same interaction event stream.

<<< @/snippets/interaction/server-helpers.js#docs

It handles the boilerplate of checking for recipe IDs (like `"agent"` or `"chat.rag"`), extracting the user's last message, and wiring up the runner.

## Example Scenario

Imagine a **Chat UI** that needs to stream assistant messages, record a trace for debugging, and store per-session state in a database.

The pipeline runs the model adapter and emits `interaction.model` events. These events travel through transport, for example over Server-Sent Events, into the browser. On the client, the reducer listens to the incoming stream and updates the interaction state so the chat messages on screen reflect the latest tokens and tool results. After the stream finishes, the session layer on the server stores the final state in your database so the next request can load the same conversation and continue from there.
