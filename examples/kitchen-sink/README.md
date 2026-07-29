# v2 capability surface examples

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
