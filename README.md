# @geekist/llm-core

Portable contracts and controlled orchestration for LLM applications.

`llm-core` 2 is ESM-only and requires Node.js 22 or newer.

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

The root contains the common `createAgent`, `defineTool`, and
`createConversation` journeys. Runtime implementers use explicit extension
paths such as `@geekist/llm-core/agent/runtime` and
`@geekist/llm-core/tools/runtime`. Provider integrations live on qualified
adapter paths such as `@geekist/llm-core/adapters/ai-sdk`.

Common application conversations start with `createConversation`. The
`@geekist/llm-core/interaction` subpath is the extension surface for explicit
runner sessions, raw events, projections, and live reconnect state.

Provider-native data is accepted only through validated, namespaced, redacted
extensions. Credentials and live provider objects remain outside portable
contracts.

See the [documentation](./docs/index.md) and the
[1.x to 2.0 migration map](./docs/reference/migration-2.md).
