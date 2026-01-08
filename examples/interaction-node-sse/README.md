# Interaction SSE Demo (Node)

This is a tiny example app that streams interaction events over SSE. It uses the built-in model,
so it runs without API keys.

## Run

```bash
bun examples/interaction-node-sse/server.js
```

Then open:

```
http://localhost:3030
```

## Notes

- The demo uses a single in-memory session store.
- Events are streamed as `interaction.<kind>` SSE events.
