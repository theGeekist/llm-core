# Package exports

The package is ESM-only and requires Node.js 22 or newer.

The root contains the common journeys:

- Values: `createAgent`, `defineTool`, `defineWorkflow`, `createConversation`
- Common types: `Agent`, `AgentRun`, `AgentEvent`, `AgentResult`, `Tool`,
  `ToolCall`, `ToolExecutionResult`, plus the common workflow and conversation
  families

Everything else comes from an explicit subpath:

```text
@geekist/llm-core/contracts
@geekist/llm-core/model
@geekist/llm-core/model/runtime
@geekist/llm-core/tools
@geekist/llm-core/tools/runtime
@geekist/llm-core/control
@geekist/llm-core/control/runtime
@geekist/llm-core/evidence
@geekist/llm-core/state
@geekist/llm-core/context
@geekist/llm-core/artifacts
@geekist/llm-core/evaluation
@geekist/llm-core/agent
@geekist/llm-core/agent/runtime
@geekist/llm-core/workflow
@geekist/llm-core/workflow/runtime
@geekist/llm-core/conversation
@geekist/llm-core/interaction
@geekist/llm-core/retrieval
@geekist/llm-core/indexing
@geekist/llm-core/storage
@geekist/llm-core/memory
@geekist/llm-core/media
@geekist/llm-core/adapters/ai-sdk
@geekist/llm-core/adapters/ai-sdk-ui
@geekist/llm-core/adapters/assistant-ui
@geekist/llm-core/adapters/openai-chatkit
@geekist/llm-core/adapters/nlux-ui
```

There is no broad adapter barrel. This keeps provider dependencies and native
types behind qualified boundaries.

The root owns the common agent, tool, workflow, and conversation journeys.
The five `/runtime` fronts own preparation, explicit runners, executable tools,
action control, resolution and durable runtime composition. Capability fronts
such as `/retrieval`, `/storage`, `/memory` and `/media` remain explicit.

For ownership and representative exports, see [API by subpath](/reference/api).
