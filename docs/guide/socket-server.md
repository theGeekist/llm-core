# Building a Socket Server

This guide demonstrates how to build a real-time, socket-based LLM server using **Bun** and **@geekist/llm-core**.

With `Bun.serve`'s built-in WebSocket support and `@geekist/llm-core`'s stream-first design, you can create efficient, persistent AI sessions with minimal boilerplate.

## Overview

1.  **Server**: Uses `Bun.serve` to handle WebSocket upgrades.
2.  **Session**: Uses `createInteractionSession` to manage state.
3.  **Events**: Bridges the internal `InteractionEvent` stream to the WebSocket `send` method.

## Code Example

Below is a complete, runnable example.

<<< @/snippets/guide/socket-server.ts

## Key Concepts

### 1. WebSocket Upgrade

Bun handles the HTTP-to-WebSocket upgrade in the `fetch` handler. You can pass initial context (like a `sessionId`) in the `data` property of `server.upgrade`.

### 2. Event Stream Bridging

The `createInteractionEventEmitterStream()` function creates a standard Node.js-style implementation of the `EventStream` interface.

- **Internal**: The session writes events to this stream.
- **External**: We listen to `data` events on this stream and forward them to the client via `ws.send()`.

### 3. Session Persistence

In this example, we use `createMemoryCache()` for ephemeral storage. For production, simply swap this with a persistent store (e.g., Redis, Postgres) that implements the `SessionStore` interface.

## Client Communication

The server expects a simple string message from the client (the user prompt). It responds with a stream of JSON-serialized `InteractionEvent` objects.

**Example Client Message:**

```text
Hello, who are you?
```

**Example Server Responses:**

```json
{"kind":"start", ...}
{"kind":"delta", "delta":"I", ...}
{"kind":"delta", "delta":" am", ...}
{"kind":"stop", ...}
```
