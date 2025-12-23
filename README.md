# @geekist/llm-core

Composable workflow + adapter core for the JS/TS LLM ecosystem.

[![CI](https://github.com/theGeekist/llm-core/actions/workflows/ci.yml/badge.svg)](https://github.com/theGeekist/llm-core/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/theGeekist/llm-core/branch/main/graph/badge.svg)](https://codecov.io/gh/theGeekist/llm-core)
[![SonarCloud](https://sonarcloud.io/api/project_badges/measure?project=theGeekist_llm-core&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=theGeekist_llm-core)
[![Docs](https://img.shields.io/badge/docs-llm--core.geekist.co-0b0f14?style=flat&labelColor=0b0f14&color=f5c451)](https://llm-core.geekist.co/)

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

- Docs site: https://llm-core.geekist.co/
- Adapters API: docs/adapters-api.md
- Workflow API: docs/workflow-api.md
- ETL example: docs/examples/etl-pipeline.ts

## Contributing

```bash
bun install
bun run lint
bun run typecheck
bun test
```

## License

TBD.
