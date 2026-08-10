# @aifsd/llm-core

Portable contracts, conformance, authority, and evidence for AI applications.

Version 2 publishes ESM and requires Node.js 22 or newer.

```bash
npm install @aifsd/llm-core
```

```ts
import { defineTool } from "@aifsd/llm-core";

const search = defineTool<{ query: string }>({
  name: "search",
  description: "Search the knowledge base.",
  input: {
    schema: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
      additionalProperties: false,
    },
    validate: (value) =>
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value) &&
      typeof value.query === "string"
        ? { valid: true }
        : { valid: false, issues: [{ path: "query", code: "required" }] },
  },
  effect: "read-only",
  execute: ({ query }) => ({ matches: [`Result for ${query}`] }),
});
```

The package does not provide a default agent loop, workflow engine, or conversation executor. Runtime integrations implement the `AgentRunner` port from `@aifsd/llm-core/agent/runtime`; applications select an integration and pass it explicitly to the interaction APIs. `@aifsd/llm-core/workflow` contains portable workflow intent, not a local runtime.

The root contains the smallest common contract journey. Explicit subpaths provide specifications, runtime ports, controlled tool execution, interaction sessions, evidence, state, and qualified provider or UI adapters.

Provider-native data is projected only as validated, namespaced, redacted JSON. Portable values never contain credentials, physical paths, or live framework objects.

See the [documentation](https://llm-core.geekist.co/), the [package engineering documents](https://github.com/theGeekist/llm-core/blob/main/packages/llm-core/docs/README.md), the [architecture](https://github.com/theGeekist/llm-core/blob/main/packages/llm-core/docs/final-architecture/README.md), and the [version 2 migration guide](https://github.com/theGeekist/llm-core/blob/main/docs/reference/migration-2.md).
