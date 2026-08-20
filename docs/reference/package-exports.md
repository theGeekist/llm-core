# Package exports

The package is ESM-only and requires Node.js 22 or newer. It publishes 31 dependency-neutral entrypoints after the ADR-016 boundary correction, plus four independently qualified adapter or protocol entrypoints.

The root exports `defineTool` plus the specification load, review, and compile operations. Root types describe portable agent, workflow, conversation, tool, and specification values; they are not ready-to-run objects.

Important ownership fronts are:

```text
@geekist/llm-core/agent
@geekist/llm-core/agent/runtime
@geekist/llm-core/workflow
@geekist/llm-core/conversation
@geekist/llm-core/interaction
@geekist/llm-core/specifications
@geekist/llm-core/adapters/catalogue
@geekist/llm-core/adapters/catalogue/runtime
@geekist/llm-core/adapters/langchain
@geekist/llm-core/adapters/llamaindex
@geekist/llm-core/a2a
@geekist/llm-core/mcp
```

`./agent/runtime` exposes the runner SPI but no concrete implementation. Concrete runtime support is published only through exact-version qualified adapter subpaths. `./workflow/runtime` was removed because the kernel does not own a workflow executor.

`./specifications` publishes source snapshots, closed exact operation matrices and target-bound change proposals. Every matrix covers all five operation families and binds one authority, format and immutable revision throughout. `SpecificationGraph` contains only portable nodes, relationships and their source bindings. Adapter diagnostics belong to the independently returned operation result; there is no graph-level conversion fidelity report.

`./tools/runtime` is the package-owned aggregation front for tooling runtime contracts and controlled tool execution. The tooling feature remains dependency-inward and does not import application orchestration.

There is no broad adapter barrel. Provider dependencies and native types stay behind qualified boundaries. See [API by subpath](/reference/api).

`./adapters/catalogue` publishes the immutable operation catalogue and inert candidate-resolution contracts. The separate `./adapters/catalogue/runtime` front publishes exact post-acceptance acquisition and factory types, keeping live resources out of planning. `./adapters/langchain` and `./adapters/llamaindex` expose only the qualified retriever constructors; the other implemented ecosystem operations remain internal catalogue rows. Their public external authorities are exact optional peers: `@langchain/core` 1.1.8 and `@llamaindex/core` 0.6.22. The packed release qualifier installs those peers in an isolated consumer, resolves inert candidates, acquires exact factories, and runs the same portable retriever operation through both fronts. This proves operation-scoped substitution for retrieval; it does not claim that every ecosystem operation is interchangeable.

`./a2a` and `./mcp` are conditional in the release sense: each has an exact upstream support window, operation matrix, hostile-input fixtures and durable release qualifier. They share package publication machinery only. Their contracts, native ownership and executable evidence remain separate.
