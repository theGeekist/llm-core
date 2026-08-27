---
id: applications-client-contract
title: Shared end-user client application contract
stage: applications
status: cancelled
forward_to:
  - aifsd/clients-shared-work-control-contract
priority: high
depends_on:
  - architecture-source-layout-normalization
  - applications-client-characterization
  - integrations-authorization-lifecycle
  - cost-facts
  - cost-budget-enforcement
  - model-routing-qualification
decision_dependencies:
  - ADR-001
  - ADR-006
  - ADR-012
  - ADR-014
  - ADR-015
  - ADR-016
conflicts_with: []
write_scope:
  - packages/llm-core/src/client/**
  - packages/llm-core/tests/client/**
  - docs/applications/client.md
  - packages/llm-core/docs/final-architecture/tasks/applications-client-contract.md
required_reading:
  - path: packages/aifsd/docs/final-architecture/LLM-CORE-PARITY.md
    reason: "Retain the cancelled client contract as cross-authority provenance."
  - path: packages/aifsd/docs/final-architecture/tasks/clients-shared-work-control-contract.md
    reason: "Use the committed AIFSD shared application task as current product authority."
read_scope:
  - packages/aifsd/docs/final-architecture/LLM-CORE-PARITY.md
  - packages/aifsd/docs/final-architecture/tasks/clients-shared-work-control-contract.md
  - packages/llm-core/index.ts
  - packages/llm-core/src/**/public.ts
  - packages/llm-core/src/agent/index.ts
  - packages/llm-core/src/agent/runtime.ts
  - packages/llm-core/src/control/index.ts
  - packages/llm-core/src/control/runtime.ts
  - packages/llm-core/src/tools/**
  - packages/llm-core/src/workflow/index.ts
  - packages/llm-core/src/workflow/runtime.ts
  - packages/llm-core/package.json
  - packages/llm-core/tests/**
review_owner: coordinator
updated_at: 2026-08-04
---

# applications-client-contract — Shared end-user client application contract

Cancelled by ADR-016 before implementation. A client contract must be derived
from demonstrated operator consumers after the AIFSD delivery toolchain exists.
The committed AIFSD replacement retains that evidence-before-contract boundary.

## Objective

Derive the stable client-facing application and synchronization contract from
the characterized desktop/mobile and local/fake-remote journeys without
importing kernel internals or assuming a particular UI/native framework.

## In scope

- Account/tenant selection, connection management, run submission/control,
  event cursors, approvals, usage/cost projections, budget decisions, advisory
  routing recommendations, cache state and explicit offline/conflict
  dispositions.
- Local and remote host transports behind the same typed client boundary.
- Redacted, versioned app persistence and migration fixtures.
- A package-local `src/client` implementation that remains unexported until its
  coordinator-owned subpath-release task qualifies the package front.
- Contract, transport and persistence tests that do not depend on root source
  aliases or feature-internal imports.
- A trace from every shared operation and state field to both characterized
  consumers; platform-specific behavior remains outside the shared contract.

## Out of scope

- UI components, OS credential storage, OAuth browser callbacks,
  notifications, analytics storage, app-store release or deep imports from
  `llm-core` features, a separate `llm-client` package, package-export changes
  or public client-subpath support.

## Acceptance criteria

- The same contract tests pass against local and fake remote hosts.
- Client state distinguishes replayable event data, cache projections and
  non-portable runtime/credential references.
- Offline mutation conflicts fail or reconcile explicitly; they never silently
  duplicate controlled effects.
- Client implementation remains under the package-level delivery boundary and
  imports feature/application behavior only through curated fronts.
- No package manifest, build entrypoint, TypeScript mapping or root/public
  export is added by this task; successful implementation is not publication.
- Budget and routing projections retain decision/evidence provenance and never
  turn an advisory recommendation into execution authority.
- Tests reject imports from feature internals and prove the local/fake-remote
  contract without relying on the removed `./functional` surface.

## Verification

```sh
bun install --frozen-lockfile
bun test packages/llm-core/tests/client
bun run typecheck:packages
bun run typecheck:tests
bun run lint
bun run --cwd packages/llm-core release:build
bun run docs:check
bun run --cwd packages/llm-core format:check
```

## Work log

Planned from ADR-014 and narrowed by ADR-015; blocked on client
characterization. The resulting implementation remains unexported until
`applications-client-subpath-release`; not claimed.

## Handoff

Pending.
