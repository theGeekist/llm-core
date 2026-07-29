# Package exports

The package is ESM-only and requires Node.js 22 or newer.

The root contains only local agent orchestration:

- Runtime values: `createLocalAgentRunner`, `prepareAgentSpec`
- Types: `AgentSpec`, `PreparedAgentSpec`, `AgentRunner`,
  `AgentRunnerCapabilities`, `AgentRun`, `AgentRunRequest`, `AgentRunEvent`,
  `RunResult`, `MaybePromise`, `MaybeAsyncIterable`

Everything else comes from an explicit subpath:

```text
@geekist/llm-core/functional
@geekist/llm-core/contracts
@geekist/llm-core/model
@geekist/llm-core/tools
@geekist/llm-core/control
@geekist/llm-core/evidence
@geekist/llm-core/state
@geekist/llm-core/context
@geekist/llm-core/artifacts
@geekist/llm-core/evaluation
@geekist/llm-core/agent
@geekist/llm-core/workflow
@geekist/llm-core/interaction
@geekist/llm-core/adapters/ai-sdk
@geekist/llm-core/adapters/ai-sdk-ui
@geekist/llm-core/adapters/assistant-ui
@geekist/llm-core/adapters/openai-chatkit
@geekist/llm-core/adapters/nlux-ui
```

There is no broad adapter barrel. This keeps provider dependencies and native
types behind qualified boundaries.

For ownership and representative exports, see [API by subpath](/reference/api).
