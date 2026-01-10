import { createInteractionSession, type InteractionState, type SessionStore } from "#interaction";
// Import adapters/types directly for low-level event types
import type { EventStreamEvent } from "#adapters/types";
// We use a simple in-memory store for this example, or you can implement your own backed by Redis/DB

// 1. Define types for our socket context
type SocketData = {
  createdAt: number;
  sessionId: string;
};

// 2. Create a simple in-memory session store
// In production, use a persistent store (all methods can be async)
const createMemorySessionStore = (): SessionStore => {
  const data = new Map<string, InteractionState>();

  return {
    load: (sessionId) => {
      // Handle composite IDs if needed, but here simple string
      const key = typeof sessionId === "string" ? sessionId : sessionId.sessionId;
      return data.get(key) ?? null;
    },
    save: (sessionId, state) => {
      const key = typeof sessionId === "string" ? sessionId : sessionId.sessionId;
      data.set(key, state);
      return true;
    },
  };
};

// 3. Setup the Bun WebSocket server
Bun.serve<SocketData>({
  port: 3000,
  fetch(req, server) {
    // 4. Upgrade the connection to a WebSocket
    const success = server.upgrade(req, {
      // Pass initial data
      data: {
        createdAt: Date.now(),
        sessionId: "session-" + crypto.randomUUID(),
      },
    });
    if (success) {
      return undefined;
    }
    return new Response("Hello world!");
  },
  websocket: {
    async open(ws) {
      console.log("Client connected", ws.data.sessionId);
    },
    async message(ws, message) {
      if (typeof message !== "string") {
        return; // Binary interface not supported in this simple example
      }

      // 5. Create an event stream bridge
      // This simple object satisfies the EventStream interface
      // and forwards any events directly to the websocket
      const eventStream = {
        emit(event: EventStreamEvent) {
          // Forward the event to the client
          ws.send(JSON.stringify(event));
          return true;
        },
        emitMany(events: EventStreamEvent[]) {
          for (const event of events) {
            ws.send(JSON.stringify(event));
          }
          return true;
        },
      };

      // 6. Initialize the interaction session
      // Uses our memory store and the socket bridge
      const session = createInteractionSession({
        sessionId: ws.data.sessionId,
        store: createMemorySessionStore(),
        eventStream,
      });

      // 7. Handle the incoming message
      // This processes the input through the interaction pipeline (reducer -> adapter -> reducer)
      // Note: This uses the default interaction pipeline. To use a specific Recipe,
      // you would configure the `adapters` or `pipeline` options here.
      await session.send({
        role: "user",
        content: message,
      });
    },
    close(_ws) {
      console.log("Client disconnected");
    },
  },
});

console.log(`Listening on localhost:3000`);
