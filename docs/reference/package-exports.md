# Package exports

The package is ESM-only and requires Node.js 22 or newer. It publishes 29
unconditional entrypoints after the ADR-016 boundary correction.

The root exports `defineTool` plus the specification load, review, and compile
operations. Root types describe portable agent, workflow, conversation, tool,
and specification values; they are not ready-to-run objects.

Important ownership fronts are:

```text
@geekist/llm-core/agent
@geekist/llm-core/agent/runtime
@geekist/llm-core/workflow
@geekist/llm-core/conversation
@geekist/llm-core/interaction
@geekist/llm-core/specifications
```

`./agent/runtime` exposes the runner SPI but no concrete implementation.
Concrete runtime support is published only through exact-version qualified
adapter subpaths. `./workflow/runtime` was removed because the kernel does not
own a workflow executor.

There is no broad adapter barrel. Provider dependencies and native types stay
behind qualified boundaries. See [API by subpath](/reference/api).
