---
layout: home

hero:
  name: llm-core
  text: Orchestrate LLM logic instead of gluing it
  tagline: Create ready agents and tools for common work, then reach for explicit runtime contracts when you implement an extension.
  image:
    src: /logo.png
    alt: llm-core logo
  actions:
    - theme: brand
      text: Get started
      link: /guide/hello-world
    - theme: alt
      text: Understand the design
      link: /guide/core-concepts

features:
  - title: Agents start ready
    details: createAgent returns an Agent that can run directly or start a live AgentRun.
  - title: Capabilities are ports
    details: Stable contracts keep model, tool, control, evidence, state, and storage concerns separate from adapters.
  - title: Effects follow one path
    details: Policy, approval, execution, and receipts remain distinct, so meaningful effects fail closed.
  - title: Events stay precise
    details: AgentEvent, ToolExecutionEvent, and InteractionEvent each describe a different lifecycle.
---

## Install

`llm-core` 2 requires Node.js 22 or newer and publishes ESM only.

```bash
npm install @geekist/llm-core
```

## The short version

[`createAgent`](/guide/agent) returns a ready
[`Agent`](/reference/vocabulary#agents). Run it directly for one
`AgentResult`, or start an [`AgentRun`](/reference/vocabulary#agents) that
emits typed `AgentEvent` values.

`defineWorkflow` turns ordered application steps into a ready `Workflow`.
Calling `Workflow.run` returns a `WorkflowResult`.
`createConversation` sends input or streams projected `ConversationEvent`
values. Runtime and adapter authors use `/interaction` to reduce raw
`InteractionEvent` values into deterministic application state.

These lifecycles share portable contracts, but they do not collapse into one
generic event or result type.

Start with [Get started](/guide/hello-world), then explore
[Core concepts](/guide/core-concepts) and
[Package exports](/reference/package-exports).
