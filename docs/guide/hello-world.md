# Get started

The smallest complete agent run has three parts:

1. Choose a model.
2. Create an agent with instructions and optional tools.
3. Run it directly or start a live run.

<<< @/snippets/v2/local-agent.ts

`createAgent` hides preparation and invocation identity. Runtime implementers
who need explicit ports, portable definitions, or resume support use the
qualified `/agent/runtime` extension.

The example is read-only. Meaningful tool effects must pass through the
controlled tool-execution path, where policy, approval, execution, and receipt
recording remain distinct.

Next, read [Core concepts](/guide/core-concepts) and
[Package exports](/reference/package-exports).
