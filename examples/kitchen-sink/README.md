# Kitchen sink shape fixture

This simplified example is a **shape-only compile fixture**, not a canonical
interaction application. The server demonstrates the final root runner
lifecycle. The client proves the qualified assistant-ui projection type
resolves.

This directory contains two intentionally small checks:

- `server/index.ts` prepares an `AgentSpec`, starts a local `AgentRunner`, and
  reads its terminal `RunResult`.
- `client/src/main.tsx` imports the qualified assistant-ui projection surface.

Build the package before checking the examples:

```bash
bun run build
bun run typecheck:examples
bun run --cwd examples/kitchen-sink/client build
```

The server example is a local program, not a provider integration. Use
`@geekist/llm-core/adapters/ai-sdk` when composition supplies an AI SDK 7 model.
For a real session lifecycle and event-to-UI mapping, use the
[interaction guide](../../docs/interaction/index.md).
