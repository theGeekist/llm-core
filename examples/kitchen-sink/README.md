# Kitchen sink shape fixture

This simplified example is a **shape-only compile fixture**, not a canonical
conversation application. The server accepts an `AgentRunner` supplied by a
runtime integration and demonstrates the neutral lifecycle without providing a
local fallback. The client proves the qualified assistant-ui projection type
resolves.

This directory contains two intentionally small checks:

- `server/index.ts` prepares an `AgentDefinition` with a caller-supplied
  `AgentRunner` and reads its terminal `AgentResult`.
- `client/src/main.tsx` imports the qualified assistant-ui projection surface.

Build the package before checking the examples:

```bash
bun run build
bun run typecheck:examples
bun run --cwd examples/kitchen-sink/client build
```

The server example is a compile fixture, not a provider integration. A real
application supplies a qualified runtime adapter explicitly.
For common conversations and the explicit interaction-session extension, use
the [conversation and interaction guide](../../docs/interaction/index.md).
