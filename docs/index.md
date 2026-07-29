---
layout: home

hero:
  name: llm-core
  text: Orchestrate LLM logic instead of gluing it
  tagline: Describe agents as portable data, execute them through typed runners, and project canonical events into application state.
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
  - title: Specs describe agents
    details: AgentSpec captures portable intent. A compatible AgentRunner prepares it and starts a live AgentRun.
  - title: Capabilities are ports
    details: Stable contracts keep model, tool, control, evidence, state, and storage concerns separate from adapters.
  - title: Effects follow one path
    details: Policy, approval, execution, and receipts remain distinct, so meaningful effects fail closed.
  - title: Events stay precise
    details: AgentRunEvent, ExecutionEvent, and InteractionEvent each describe a different lifecycle.
---

## Install

`llm-core` 2 requires Node.js 22 or newer and publishes ESM only.

```bash
npm install @geekist/llm-core
```

## The short version

An [`AgentSpec`](/reference/vocabulary#agents) describes an agent. An
[`AgentRunner`](/reference/vocabulary#agents) prepares that spec, starts an
[`AgentRun`](/reference/vocabulary#agents), and produces one terminal
`RunResult`. The live run emits typed `AgentRunEvent` values.

A `WorkflowDefinition` describes ordered application steps. The workflow
runtime executes those steps and returns a `WorkflowExecutionOutcome`.
Interactions reduce canonical `InteractionEvent` values into deterministic
application state.

These lifecycles share portable contracts, but they do not collapse into one
generic event or result type.

Start with [Get started](/guide/hello-world), then explore
[Core concepts](/guide/core-concepts) and
[Package exports](/reference/package-exports).
