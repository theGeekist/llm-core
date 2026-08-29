---
id: kernel-aifsd-public-front-language
title: Clarify the llm-core and AIFSD public boundary
stage: language
status: done
priority: high
forward_to: []
depends_on:
  - language-rollout
  - integrations-connector-characterization
decision_dependencies:
  - ADR-011
  - ADR-016
conflicts_with: []
write_scope:
  - README.md
  - docs/index.md
  - docs/reference/package-exports.md
  - docs/reference/vocabulary.md
  - docs/reference/design-decisions.md
  - packages/llm-core/README.md
  - packages/llm-core/package.json
  - packages/llm-core/src/agent/runtime.ts
  - packages/llm-core/src/application/capability-bindings/**
  - packages/llm-core/src/composition/capability-bindings/**
  - packages/llm-core/src/adapters/catalogue/**
  - packages/llm-core/tests/agent/**
  - packages/llm-core/tests/architecture/**
  - packages/llm-core/docs/README.md
  - packages/llm-core/docs/final-architecture/LANGUAGE.md
  - packages/llm-core/docs/final-architecture/decisions/ADR-011-accessible-public-language.md
  - packages/llm-core/docs/final-architecture/decisions/ADR-016-integration-owned-execution.md
  - packages/aifsd/README.md
  - packages/aifsd/package.json
  - packages/aifsd/src/**
  - packages/aifsd/tests/**
  - packages/llm-core/docs/final-architecture/tasks/kernel-aifsd-public-front-language.md
  - packages/llm-core/docs/final-architecture/STATUS.md
required_reading:
  - path: packages/llm-core/docs/final-architecture/LANGUAGE.md
    reason: Preserve the accepted kernel vocabulary and progressive-disclosure boundary.
  - path: packages/llm-core/docs/final-architecture/decisions/ADR-016-integration-owned-execution.md
    reason: Keep execution and product composition outside the portable kernel.
  - path: packages/aifsd/README.md
    reason: Treat AIFSD as the public application-composition SDK and retain its current support limits.
  - path: packages/aifsd/docs/final-architecture/VISION.md
    reason: Preserve the private product ownership map without turning planned surfaces into shipped claims.
  - path: packages/aifsd/docs/final-architecture/decisions/ADR-002-application-sdk-boundary.md
    reason: Keep AIFSD composition separate from llm-core portable contracts and ports.
  - path: packages/aifsd/docs/final-architecture/decisions/ADR-010-capability-composition-and-plugin-host.md
    reason: Preserve the accepted adapter, integration, plugin and host boundaries.
  - path: packages/aifsd/docs/final-architecture/tasks/application-capability-composition-characterization.md
    reason: Use the real planned AIFSD consumer to identify public-front gaps instead of inventing friendly aliases.
read_scope:
  - README.md
  - docs/**
  - packages/llm-core/**
  - packages/aifsd/**
  - packages/llm-core/docs/final-architecture/LANGUAGE.md
  - packages/llm-core/docs/final-architecture/decisions/ADR-016-integration-owned-execution.md
  - packages/aifsd/README.md
  - packages/aifsd/docs/final-architecture/VISION.md
  - packages/aifsd/docs/final-architecture/decisions/ADR-002-application-sdk-boundary.md
  - packages/aifsd/docs/final-architecture/decisions/ADR-010-capability-composition-and-plugin-host.md
  - packages/aifsd/docs/final-architecture/tasks/application-capability-composition-characterization.md
review_owner: coordinator
updated_at: 2026-08-29
---

# kernel-aifsd-public-front-language — Clarify the llm-core and AIFSD public boundary

## Objective

Make the boundary between llm-core and AIFSD easy to understand without
weakening the kernel's contracts. Move public exports only when real AIFSD work
shows that another front should own them.

## Why this exists

Earlier language work made llm-core precise, but some documentation and exports
still make the kernel look like the product-composition layer. AIFSD owns the
approachable SDK journey. llm-core owns portable contracts, runtime ports,
conformance, authority and evidence.

## Inputs

- The current llm-core package exports and documentation.
- The characterised `@aifsd/sdk/config` and `@aifsd/sdk/integrations` fronts.
- The planned AIFSD application-composition consumer.
- The accepted language and integration-ownership decisions.

## In scope

- Check the composition exports from `@geekist/llm-core/agent/runtime`. Move
  those that belong to a dedicated public front.
- Refresh the current package-export inventory and classify each public front.
- Route documentation by consumer role and explain the positive kernel job.
- Record places where AIFSD must import private code or rebuild information
  that a supported public front should provide.
- Rewrite affected active documentation, ADR explanations and task prose in
  plain English where this can be done without changing semantics.

## Out of scope

- Renaming llm-core or creating another AIFSD SDK brand.
- Publishing planned AIFSD application, client, UI or native-agent fronts.
- Renaming adapters as integrations or merging Conversation with Interaction.
- Changing wire identifiers, schemas, event kinds, reason codes, digest inputs
  or provider-session semantics.
- Editing the optional private AIFSD authority merely for stylistic consistency.

## Contract and naming constraints

- AIFSD owns approachable product composition and presentation language.
- llm-core keeps exact kernel and SPI vocabulary where it carries guarantees.
- An llm-core adapter is not automatically an AIFSD Integration.
- Plain English must preserve policy versus approval, provider acceptance versus
  processing, checkpoint and session identity, qualification and receipt facts.

## File ownership

The primary owner may edit only the declared implementation and documentation
scope. The coordinator alone changes this task's lifecycle and regenerates
`STATUS.md`.

## Acceptance criteria

- AIFSD consumers use the dedicated supported front for composition instead of
  importing those exports from the Agent runtime front.
- All repository call sites use the corrected public fronts without aliases.
- The export inventory matches the current manifest and classifies every front.
- Documentation offers clear routes for contract users, runtime or adapter
  implementers, conformance consumers and AIFSD composition consumers.
- The READMEs state the positive llm-core/AIFSD relationship in plain English.
- AIFSD support claims remain limited to characterised fronts.
- Relevant ADR and task prose is readable without erasing normative meaning.
- Package build, architecture, documentation and packed-consumer gates pass.

## Verification

```sh
bun run --cwd packages/llm-core release:build
bun run --cwd packages/llm-core check:architecture-status
bun run docs:check
bun run typecheck:packages
bun run typecheck:tests
bun run test:package
```

## Required evidence

- Exact export and import changes.
- Current export classification.
- Focused and package gate results.
- Any place where AIFSD must still import private code or rebuild information.
- Independent review of the final diff.

## Claim protocol

Follow [`../COORDINATION.md`](../COORDINATION.md) and the metadata contract in
[`README.md`](README.md).

## Work log

2026-08-29:

- The coordinator selected the task at
  `bc03185803544e260f7107d2029646ed807634ff` from a clean canonical checkout.
- Work stayed in the shared checkout.
- The active Codex App Server task owns only its adapter source and tests, so
  the two tasks do not edit the same files.
- The implementation worker owned the declared kernel, AIFSD and documentation
  changes. The coordinator retained task state, review, staging and delivery.

## Blocker

None.

## Handoff

### Result

The public boundary now matches the intended ownership. llm-core provides the
portable kernel and precise contracts. AIFSD presents those capabilities to
application developers. Generic composition no longer leaks from the Agent
runtime front.

### Decisions applied

- `@geekist/llm-core/agent/runtime` no longer exports generic composition.
- The catalogue runtime front owns acquisition, invocation and bounded retry.
- AIFSD support claims remain limited to its characterised `config` and
  `integrations` fronts.

### Files changed

- Public documentation, READMEs, language guidance and ADR explanations.
- Agent and catalogue public fronts plus their architecture tests.
- AIFSD consumer-gap evidence and the generated architecture status.

### Verification evidence

- 52 architecture tests passed.
- Package release build passed 801 tests with 4 intentional skips.
- Documentation, snippets, package and test type checks passed.
- Packed consumers verified all 35 llm-core runtime and declaration fronts.
- Independent final review reported no actionable findings.

### Deviations

None.

### Remaining risks

No known risk remains within this task's scope. Planned AIFSD application and UI
fronts remain unshipped and are not claimed here.

### Recommended next task

Resume the characterised AIFSD application-composition task when its private
authority selects it.
