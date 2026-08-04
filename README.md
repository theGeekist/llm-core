# Geekist AI ecosystem

This workspace contains independently owned packages for portable AI
contracts, runtime integrations, and AI-first software delivery. The packages
share one ecosystem documentation site while retaining their own engineering
documents and architecture authority.

## Packages

| Package                                              | Purpose                                                                      | Package documents                                                         |
| ---------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| [`@geekist/llm-core`](./packages/llm-core/README.md) | Portable contracts, conformance, authority, and evidence for agentic systems | [`packages/llm-core/docs`](./packages/llm-core/docs/README.md)            |
| [`@aifsd/sdk`](./packages/aifsd/README.md)           | Build and Runtime SDK product journeys, integrations, templates, and clients | Private engineering authority; optional local `packages/aifsd/docs` mount |

Additional packages use the same ownership shape:

```text
packages/<package>/
├── README.md
├── docs/
├── src/
└── tests/
```

The shared [VitePress site](./docs/index.md) currently documents `llm-core` and
can aggregate future package sections. Start package work from its README and
engineering docs. Documentation-only internal material belongs under
`packages/<package>/docs/internal/`.
