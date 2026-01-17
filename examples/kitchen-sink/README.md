# Kitchen Sink (Bun WebSocket)

A streaming demo that runs **recipes on the server** and streams **interaction UI chunks** to the client over Bun WebSockets.

## Run

In two terminals:

```bash
cd examples/kitchen-sink/server
bun install
bun run dev
```

```bash
cd examples/kitchen-sink/client
bun install
bun run dev
```

Open <http://localhost:5173>.

## Notes

- The client resolves `@geekist/llm-core` types from the local build output, so build the package first (e.g. `bun run build` at repo root).
- The server uses `recipes.*` and wraps model adapters to emit `InteractionEvent` streams.
- The client uses `useChat` (AI SDK) + `useChatRuntime` (assistant-ui) with a WebSocket `ChatTransport`.
- Configure provider keys in `examples/kitchen-sink/server/.env` (copy from your root `.env` if needed).
