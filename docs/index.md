---
layout: home

hero:
  name: llm-core
  text: Portable contracts for AI delivery and agent runtimes
  tagline: Govern intent, authority, evidence, and runtime interoperability without hiding a home-grown execution engine.
  image:
    src: /logo.png
    alt: llm-core logo
  actions:
    - theme: brand
      text: Get started
      link: /guide/hello-world
    - theme: alt
      text: Understand the boundary
      link: /guide/core-concepts

features:
  - title: Runtimes stay native
    details: AgentRunner is implemented by qualified integrations; native graphs, sessions, and checkpoints remain runtime-owned.
  - title: Delivery stays governed
    details: Specifications, authority, evaluation, provenance, and evidence connect AI-first delivery to the software it produces.
  - title: Effects follow one path
    details: Policy, approval, execution, and receipts remain distinct, so consequential effects fail closed.
  - title: Interoperability is qualified
    details: Versioned adapters declare capabilities and semantic loss instead of promising universal behavior.
---

## Install

`llm-core` 2 requires Node.js 22 or newer and publishes ESM only.

```bash
npm install @geekist/llm-core
```

## The short version

`llm-core` is not an agent SDK or workflow engine. It supplies the portable
contract, authority, conformance, and evidence layer used by:

1. AI-first software delivery tools that understand, specify, build, review,
   evaluate, approve, and release software; and
2. qualified runtime integrations that execute agentic behavior inside the
   delivered product.

The package does not select a default runner. Runtime authors implement
`AgentRunner`; applications import an explicit qualified adapter.

Start with [Get started](/guide/hello-world), then read
[Core concepts](/guide/core-concepts) and
[Package exports](/reference/package-exports).
