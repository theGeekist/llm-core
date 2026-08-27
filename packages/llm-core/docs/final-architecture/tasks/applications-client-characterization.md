---
id: applications-client-characterization
title: Characterize desktop and mobile client journeys
stage: applications
status: cancelled
forward_to:
  - aifsd/clients-desktop-mobile-characterization
priority: normal
depends_on:
  - architecture-source-layout-normalization
  - specification-api
  - integrations-authorization-lifecycle
  - cost-facts
  - cost-budget-enforcement
  - model-routing-qualification
decision_dependencies:
  - ADR-006
  - ADR-014
  - ADR-015
  - ADR-016
conflicts_with:
  - adapter-strands-runtime-release
  - adapter-strands-runtime
  - runtime-temporal-reference
  - adapters-protocol-qualification
write_scope:
  - bun.lock
  - apps/desktop-headless-characterization/**
  - apps/mobile-headless-characterization/**
  - packages/llm-core/tests/applications/characterization/**
  - docs/applications/characterization/**
  - packages/llm-core/docs/final-architecture/tasks/applications-client-characterization.md
required_reading:
  - path: packages/aifsd/docs/final-architecture/LLM-CORE-PARITY.md
    reason: "Retain the cancelled client brief as cross-authority provenance."
  - path: packages/aifsd/docs/final-architecture/tasks/clients-desktop-mobile-characterization.md
    reason: "Use the committed AIFSD characterization task as current product authority."
read_scope:
  - packages/aifsd/docs/final-architecture/LLM-CORE-PARITY.md
  - packages/aifsd/docs/final-architecture/tasks/clients-desktop-mobile-characterization.md
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
review_owner: coordinator
updated_at: 2026-08-04
---

# applications-client-characterization — Characterize desktop and mobile client journeys

Cancelled by ADR-016 before implementation. Operator-client characterization
may be proposed again only after delivery and runtime-substitution evidence.
The committed AIFSD replacement preserves the independent desktop/mobile and
local/remote characterization before any shared client contract.

## Objective

Derive shared-client candidates from two executable, private consumers: one
thin headless desktop operator journey and one headless mobile companion
journey. Exercise both against local and fake-remote host fixtures before
designing a package contract.

## In scope

- Executable `desktop-headless-characterization` and
  `mobile-headless-characterization` walking skeletons. Each owns duplicated,
  task-local ports and state rather than importing a shared client contract.
- Local and fake-remote transport characterization for submission, cursors,
  approvals, authorization references, resumption, cost facts, budget decisions
  and evaluation-backed routing recommendations.
- End-to-end tests that drive both consumers through the same observable
  journeys without requiring their internal shapes to match.
- A common/platform-specific field and behavior report derived from the two
  working consumers.

## Out of scope

- Publishing or pre-implementing the shared client contract, sharing client-side
  ports or state between the two skeletons, choosing UI/native frameworks, real
  credentials, app signing or production remote infrastructure.

## Acceptance criteria

- Both executable journeys cover run control, event cursors, approvals,
  authorization references, cost facts, budget decisions and routing
  recommendations using independently declared, task-local client ports.
- Budget dispositions and routing explanations preserve their evidence and
  advisory/authority boundaries; neither consumer treats a recommendation as an
  authorized reroute.
- Local and fake-remote fixtures expose replay, offline and conflict behavior.
- Platform-only concerns are recorded rather than forced into a common API.
- Tests prove each walking skeleton actually executes its journey; static
  fixture comparison alone cannot satisfy characterization.
- The report traces every proposed shared field and operation to observable
  evidence in both consumers and records rejected similarities.
- The output is executable private evidence, not a published client package;
  neither skeleton imports `packages/llm-core/src/client` or a common task-local
  client abstraction.
- Both consumers import only curated `@geekist/llm-core` package fronts; source
  paths in `read_scope` are inspection authority, not permitted deep-import
  specifiers.

## Verification

```sh
bun install --frozen-lockfile
bun test apps/desktop-headless-characterization
bun test apps/mobile-headless-characterization
bun run --cwd apps/desktop-headless-characterization typecheck
bun run --cwd apps/mobile-headless-characterization typecheck
bun test packages/llm-core/tests/applications/characterization
bun run typecheck:tests
bun run lint
bun run docs:check
bunx prettier "apps/desktop-headless-characterization/**/*.{ts,tsx,js,jsx,json,md}" "apps/mobile-headless-characterization/**/*.{ts,tsx,js,jsx,json,md}" "docs/applications/characterization/**/*.md" --check
```

## Work log

Planned by ADR-015; not claimed.

## Handoff

Pending.
