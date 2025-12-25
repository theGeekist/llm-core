# @geekist/llm-core

Composable workflow + adapter core for the JS/TS LLM ecosystem.

[![CI](https://github.com/theGeekist/llm-core/actions/workflows/ci.yml/badge.svg)](https://github.com/theGeekist/llm-core/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/theGeekist/llm-core/branch/main/graph/badge.svg)](https://codecov.io/gh/theGeekist/llm-core)
[![SonarCloud](https://sonarcloud.io/api/project_badges/measure?project=theGeekist_llm-core&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=theGeekist_llm-core)
[![Docs](https://img.shields.io/badge/docs-llm--core.geekist.co-0b0f14?style=flat&labelColor=0b0f14&color=f5c451)](https://llm-core.geekist.co/)

## Why

LLM tooling is fragmented. `llm-core` unifies it with **principled orchestration**:

- **Cross-ecosystem**: Plug into LangChain, LlamaIndex, or AI SDK with a single primitive set.
- **Recipe-first**: Treat workflows as named, versioned assets, not throwaway scripts.
- **DAG-driven**: Reorder steps and manage state without touching the rest of the graph.
- **Adapters**: Swap models or vector stores via config, avoiding full rewrites.
- **MaybePromise**: Write sync-looking business logic that plugs into async pipelines directly.
- **Deterministic**: Debug behavior via trace graphs, not by reading string logs.
- **Interop-aware**: Check parity gaps in the repo so you don't guess what works.

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
