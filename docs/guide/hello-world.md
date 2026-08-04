# Get started

Begin with a portable contract or specification, then choose the integration
that owns execution. `llm-core` deliberately has no hello-world local agent
loop.

<<< @/snippets/v2/agent-capabilities.ts

The `runner` in this example is supplied by the host or a runtime integration.
It is not provided by the kernel. A future qualified adapter may bind a native
framework, but no framework becomes supported until its exact adapter subpath
and conformance evidence are published. Native session, graph, checkpoint, and
workspace state do not become portable merely because a runner implements
`AgentRunner`.

For specification-driven work, load and review external intent, then compile it
through an explicit adapter target. Compilation does not execute the result.

Continue with [agents and runners](/guide/agent),
[workflow intent](/guide/workflow), or the
[architecture boundary](/guide/core-concepts).
