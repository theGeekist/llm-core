---
layout: home

hero:
  name: llm-core
  text: Orchestrate LLM logic instead of gluing it
  tagline: Describe an agent as data, execute it on a typed runner, and read every step back as a traceable event stream.
  image:
    src: /logo.png
    alt: llm-core logo
  actions:
    - theme: brand
      text: Get started
      link: /guide/hello-world
    - theme: alt
      text: Why llm-core?
      link: /guide/philosophy

features:
  - title: Describe an agent as a spec
    details: An AgentSpec captures a probabilistic agent as data (its model, tools, and policy). Hand it to a runner and the same spec can run on compatible runner implementations.
  - title: Capabilities are ports, adapters plug in
    details: A capability defines a port with a stable contract; a provider or framework is the appliance that plugs into it. Change provider or region and the rest of your logic stays put.
  - title: Runs read back as events
    details: Every tool call, policy decision, and result arrives as a redacted ExecutionEvent. You debug state at each step instead of scanning a long prompt.
  - title: Pause and resume are first class
    details: A run can wait on a person or a tool through an InterventionRequest; when the runner supports checkpoint resume it hands you a ResumableCheckpoint to store and continue later. Waiting stays structured.
  - title: Effects travel one controlled path
    details: Policy, approval, and execution are separate steps, and each side-effecting tool leaves a ToolExecutionReceipt. Non-read-only effects fail closed.
---

## What it is

When people build AI features today, they tend to glue or to orchestrate. With
gluing, you start with a script: you call the provider, parse some JSON, add a
retry loop, later swap models and rework the prompt, and over time the script
becomes a web only one person understands.

`llm-core` sits in the second camp. You describe an agent as an
[`AgentSpec`](/reference/vocabulary#agents) and hand it to an
[`AgentRunner`](/reference/vocabulary#agents). The runner executes it and emits
each tool call, [policy decision](/reference/vocabulary#control), and result as a
redacted [`ExecutionEvent`](/reference/vocabulary#evidence). Provider types stay
behind the [adapter boundary](/adapters/), so a model swap stays local to one
adapter while the rest of your logic holds still.

What changed from v1 is that the vocabulary got sharper, not that the ideas
changed. `Recipe`, `Workflow`, and the `Outcome` union all stay, with cleaner
edges: a `Recipe` packages a `Workflow`, a `Workflow` orchestrates `Step`s, and
an agent is described by an `AgentSpec` and executed by an `AgentRunner`. The
[core concepts](/guide/core-concepts) page walks the model, and the
[Vocabulary](/reference/vocabulary) defines each noun.

## Install

A runtime-agnostic core that runs in Node, Bun, Edge, and browsers.

::: tabs
== bun

```bash
bun add @geekist/llm-core
```

== pnpm

```bash
pnpm add @geekist/llm-core
```

== npm

```bash
npm install @geekist/llm-core
```

== yarn

```bash
yarn add @geekist/llm-core
```

== deno

```bash
deno add npm:@geekist/llm-core
```

:::

## How a run reads

A run is a sequence you can watch:

1. **You describe the work.** An `AgentSpec` for an agent, or a `Recipe` and
   `Workflow` for orchestrated steps.
2. **A runner executes it,** with providers plugged in behind adapter ports.
3. **Each step emits a redacted `ExecutionEvent`,** and an agent run ends in one
   terminal `RunResult`.

[Core concepts](/guide/core-concepts) shows the shape and the
[Vocabulary](/reference/vocabulary) defines every noun.

## Where to go next

- **New here:** [Get started](/guide/hello-world) builds one run end to end.
- **Weighing it up:** [Why llm-core?](/guide/philosophy) makes the case for
  orchestrating over gluing.
- **Coming from 1.x:** the migration guide maps each renamed import and noun.
