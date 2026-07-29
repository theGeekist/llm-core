---
layout: home

hero:
  name: llm-core
  text: Orchestrate LLM logic instead of gluing it
  tagline: Describe agents as portable data, execute them through typed runners, and project redacted events into application state.
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
    details: AgentSpec is portable data. A compatible AgentRunner prepares and executes it.
  - title: Capabilities are ports
    details: Models, tools, control, evidence, state, storage, retrieval, and media use explicit contracts.
  - title: Effects follow one path
    details: Policy, approval, execution, and receipts stay separate so meaningful effects fail closed.
  - title: Events are safe to project
    details: Provider-native data enters only through validated, namespaced, redacted extensions.
---

## Install

`llm-core` 2 requires Node.js 22 or newer and publishes ESM.

```bash
npm install @geekist/llm-core
```

## The short version

An [`AgentSpec`](/reference/vocabulary#agent-spec) describes an agent. An
[`AgentRunner`](/reference/vocabulary#agent-runner) executes it and returns an
[`AgentRun`](/reference/vocabulary#agent-run). The run emits typed
`AgentRunEvent` values and terminates exactly once with a `RunResult`.

Workflows remain explicit orchestration of steps. They are separate from the
probabilistic agent loop and report through workflow outcomes.

Start with [Get started](/guide/hello-world), then read
[Contracts and portability](/reference/contracts).
