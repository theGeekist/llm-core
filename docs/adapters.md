# Adapters Overview

Adapters normalize external ecosystem constructs into one consistent shape, then let workflows mix and match them.
This is the high-level entry point; the detailed contracts live in `docs/adapters-api.md`.

Related:

- Workflow API: `docs/workflow-api.md`
- Adapter contracts: `docs/adapters-api.md`
- Recipes + plugins: `docs/recipes-and-plugins.md`

## Quick start (value-first helpers)

Register a retriever without touching registry types:

```ts
import { Adapter } from "#adapters";
import { Workflow } from "#workflow";

const wf = Workflow.recipe("rag")
  .use(
    Adapter.retriever("custom.retriever", {
      retrieve: () => ({ documents: [] }),
    }),
  )
  .build();
```

Custom constructs (e.g., `mcp`) go into constructs:

```ts
const plugin = Adapter.register("custom.mcp", "mcp", { client });
```

## Registry (advanced)

If you need explicit provider resolution, use the registry directly:

```ts
import { createRegistryFromDefaults } from "#adapters";

const registry = createRegistryFromDefaults();
registry.registerProvider({
  construct: "model",
  providerKey: "custom",
  id: "custom:model",
  priority: 10,
  factory: () => myModelAdapter,
});
```
