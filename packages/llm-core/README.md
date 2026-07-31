# @geekist/llm-core

Portable contracts and controlled orchestration for LLM applications.

Version 2 publishes ESM and requires Node.js 22 or newer.

```bash
npm install @geekist/llm-core
```

```ts
import { createAgent } from "@geekist/llm-core";
import type { Model } from "@geekist/llm-core/model";

declare const model: Model;

const agent = createAgent({
  model,
  instructions: "Return a clear, portable answer.",
});

const result = await agent.run("Why is the sky blue?");
console.log(result.status, result.output);
```

The root exposes the common agent, tool, workflow, and conversation journeys.
Runtime implementers use `/agent/runtime` and `/tools/runtime`. Use
`/interaction` for explicit runner sessions, raw interaction events,
projections, and reconnect state. Qualified adapter paths contain provider or
UI integration code.

Provider-native data is projected only as validated, namespaced, redacted JSON.
Portable values never contain credentials, physical paths, or live framework
objects.

See the [full documentation](../../docs/index.md) and
[migration map](../../docs/reference/migration-2.md).
