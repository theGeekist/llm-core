# Package exports

The package is ESM-only and requires Node.js 22 or newer. It publishes 29 unconditional entrypoints after the ADR-016 boundary correction, plus two independently qualified protocol entrypoints.

The root exports `defineTool` plus the specification load, review, and compile operations. Root types describe portable agent, workflow, conversation, tool, and specification values; they are not ready-to-run objects.

Important ownership fronts are:

```text
@aifsd/llm-core/agent
@aifsd/llm-core/agent/runtime
@aifsd/llm-core/workflow
@aifsd/llm-core/conversation
@aifsd/llm-core/interaction
@aifsd/llm-core/specifications
@aifsd/llm-core/a2a
@aifsd/llm-core/mcp
```

`./agent/runtime` exposes the runner SPI but no concrete implementation. Concrete runtime support is published only through exact-version qualified adapter subpaths. `./workflow/runtime` was removed because the kernel does not own a workflow executor.

`./specifications` publishes source snapshots, closed exact operation matrices and target-bound change proposals. Every matrix covers all five operation families and binds one authority, format and immutable revision throughout. `SpecificationGraph` contains only portable nodes, relationships and their source bindings. Adapter diagnostics belong to the independently returned operation result; there is no graph-level conversion fidelity report.

`./tools/runtime` is the package-owned aggregation front for tooling runtime contracts and controlled tool execution. The tooling feature remains dependency-inward and does not import application orchestration.

There is no broad adapter barrel. Provider dependencies and native types stay behind qualified boundaries. See [API by subpath](/reference/api).

`./a2a` and `./mcp` are conditional in the release sense: each has an exact upstream support window, operation matrix, hostile-input fixtures and durable release qualifier. They share package publication machinery only. Their contracts, native ownership and executable evidence remain separate.
