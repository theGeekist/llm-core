# @geekist/llm-core

Portable contracts and controlled orchestration for LLM applications.

`llm-core` 2 is ESM-only and requires Node.js 22 or newer.

```bash
npm install @geekist/llm-core
```

```ts
import { createLocalAgentRunner, prepareAgentSpec } from "@geekist/llm-core";
import { contractVersion } from "@geekist/llm-core/contracts";

const agent = prepareAgentSpec({
  agentId: "example.echo",
  version: contractVersion("2.0.0"),
  instructions: "Return a portable result.",
  effectRequirement: "read-only",
});
```

The root export is deliberately small. Import contracts and capabilities from
their explicit subpaths. Provider integrations live on qualified adapter
subpaths such as `@geekist/llm-core/adapters/ai-sdk`.

Provider-native data is accepted only through validated, namespaced, redacted
extensions. Credentials and live provider objects remain outside portable
contracts.

See the [documentation](./docs/index.md) and the
[1.x to 2.0 migration map](./docs/reference/migration-2.md).
