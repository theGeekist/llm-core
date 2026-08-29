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

The `llm-core` 2 candidate is ESM-only and requires Node.js 22 or newer. It is not yet published to npm.

```bash
# Available after the 2.0.0 release has registry evidence
npm install @geekist/llm-core@2.0.0
```

## The short version

`llm-core` gives AIFSD and other hosts one portable contract for describing AI intent, qualifying implementations, controlling effects, and retaining evidence. It is not an agent SDK or workflow engine. It serves:

1. AI-first software delivery tools that understand, specify, build, review, evaluate, approve, and release software; and
2. qualified runtime integrations that execute agentic behavior inside the delivered product.

The package does not select a default runner. A host or runtime integration implements `AgentRunner` and supplies it explicitly. Concrete runtime adapter subpaths become supported only after their own qualification and publication.

Choose the route that matches your work:

- [Portable capabilities](/capabilities/) for contract users.
- [Agents and runtime integrations](/guide/agent) and [qualified adapters](/adapters/) for implementers.
- [Packaging and conformance](/reference/conformance) and [evidence](/capabilities/evidence) for qualification consumers.
- [`@aifsd/sdk`](https://github.com/theGeekist/llm-core/tree/main/packages/aifsd) for application composition. Its current candidate supports only `config` and `integrations`; application composition remains planned.

[Package exports](/reference/package-exports) lists every public front and its owner.
