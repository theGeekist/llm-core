# @geekist/llm-core

Composable workflow + adapter core for the JS/TS LLM ecosystem.

[![CI](https://github.com/theGeekist/llm-core/actions/workflows/ci.yml/badge.svg)](https://github.com/theGeekist/llm-core/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/theGeekist/llm-core/branch/main/graph/badge.svg)](https://codecov.io/gh/theGeekist/llm-core)

## Why

LLM tooling is fragmented. This repo provides a stable core with:

- A workflow engine that favors DX over type gymnastics.
- Adapter surfaces that normalize LangChain, LlamaIndex, and AI SDK.
- Deterministic diagnostics, tracing, and lifecycle hooks.

## Install

```bash
bun add @geekist/llm-core
```

## Quick start

```ts
import { Workflow } from "@geekist/llm-core/workflow";

const workflow = Workflow.recipe("rag").build();
const result = await workflow.run({ query: "What is Geekist?" });

if (result.status === "ok") {
  console.log(result.artefact.Answer);
}
```

## Docs

- Docs site: https://theGeekist.github.io/llm-core/
- Adapters API: docs/adapters-api.md
- Workflow API: docs/workflow-api.md

## Contributing

```bash
bun install
bun run lint
bun run typecheck
bun test
```

## License

TBD.
