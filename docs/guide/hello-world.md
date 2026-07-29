# Get started

The smallest complete agent run has three parts:

1. Describe the agent as portable data.
2. Create a runner with explicit live dependencies.
3. Start a run and read its events and terminal result.

<<< @/snippets/v2/local-agent.ts

`AgentSpec` contains intent, not provider clients or credentials. The local
runner receives live implementation ports at composition time. A different
runner can prepare the same spec when it declares compatible capabilities.

The example is read-only. Meaningful tool effects must pass through the
controlled tool-execution path, where policy, approval, execution, and receipt
recording remain distinct.

Next, read [Core concepts](/guide/core-concepts) and
[Package exports](/reference/package-exports).
