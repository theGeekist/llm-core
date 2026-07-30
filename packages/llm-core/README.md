# @geekist/llm-core

Portable contracts and controlled orchestration for LLM applications.

Version 2 publishes ESM and requires Node.js 22 or newer.

```bash
npm install @geekist/llm-core
```

```ts
import type { AgentRunner, AgentSpec } from "@geekist/llm-core";
import { contractVersion } from "@geekist/llm-core/contracts";

const spec: AgentSpec = {
  agentId: "example.echo",
  version: contractVersion("2.0.0"),
  instructions: "Return a portable result.",
  effectRequirement: "read-only",
};

declare const runner: AgentRunner;
const agent = await runner.prepare(spec);
```

Use explicit capability subpaths for models, tools, control, evidence, state,
agents, workflows, and interaction. Qualified adapter subpaths contain
provider or UI integration code.

Provider-native data is projected only as validated, namespaced, redacted JSON.
Portable values never contain credentials, physical paths, or live framework
objects.

See the [full documentation](../../docs/index.md) and
[migration map](../../docs/reference/migration-2.md).
