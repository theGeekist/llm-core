---
id: applications-mobile
title: Mobile application foundation
stage: applications
status: cancelled
forward_to:
  - aifsd/clients-mobile-foundation
priority: medium
depends_on:
  - architecture-source-layout-normalization
  - applications-client-subpath-release
decision_dependencies:
  - ADR-006
  - ADR-014
  - ADR-015
  - ADR-016
conflicts_with:
  - applications-desktop
  - architecture-release-reproducibility
  - adapter-strands-runtime-release
  - adapter-strands-runtime
  - runtime-temporal-reference
  - adapters-protocol-qualification
  - architecture-status-validation
write_scope:
  - package.json
  - bun.lock
  - apps/mobile/**
  - docs/applications/mobile.md
  - packages/llm-core/docs/final-architecture/tasks/applications-mobile.md
required_reading:
  - path: packages/aifsd/docs/final-architecture/LLM-CORE-PARITY.md
    reason: "Retain the cancelled mobile brief as cross-authority provenance."
  - path: packages/aifsd/docs/final-architecture/tasks/clients-mobile-foundation.md
    reason: "Use the committed AIFSD mobile task as current product authority."
read_scope:
  - packages/aifsd/docs/final-architecture/LLM-CORE-PARITY.md
  - packages/aifsd/docs/final-architecture/tasks/clients-mobile-foundation.md
  - packages/llm-core/src/client/**
  - packages/llm-core/package.json
review_owner: coordinator
updated_at: 2026-08-04
---

# applications-mobile — Mobile application foundation

Cancelled by ADR-016 before implementation. Mobile is a downstream product
choice after delivery and runtime use cases are proven.
The committed AIFSD replacement retains a distinct mobile framework, device,
background, security and release decision.

## Objective

Establish one production-shaped mobile application shell, framework decision
and dependency/release baseline while remote infrastructure remains the only
durable executor.

## In scope

- A recorded mobile framework/package choice with native security, background,
  update, minimum-OS, dependency and supported-device implications.
- A minimal executable app shell importing only `@geekist/llm-core/client`, with
  one fake-host health/read journey and no product capability abstraction.
- Package-local build, typecheck, unit/native smoke and dependency gates.
- Root build/typecheck integration so the default repository gates cannot skip
  the mobile workspace.
- A follow-on decomposition for authentication/deep links, secure storage,
  synchronization, notifications, companion surfaces and release qualification.

## Out of scope

- OAuth/deep-link implementation, secure-store implementation, offline
  synchronization, notifications, conversation/approval/cost UI or app-store
  release.

## Acceptance criteria

- The framework decision compares at least native security, background limits,
  update model, minimum OS/device and test/release implications.
- The shell runs and typechecks without importing kernel source or feature
  internals; its native smoke uses the qualified client subpath.
- Root `bun.lock` is updated by a frozen-installable dependency graph.
- Root build and typecheck gates execute the mobile foundation.
- Follow-on product tasks are bounded independently; this foundation task does
  not become a full companion implementation task.
- New hand-written source/test modules satisfy the 500-SLOC rule; inherited
  exceptions require a coordinator waiver and named decomposition follow-up.

## Verification

```sh
bun install --frozen-lockfile
bun run --cwd apps/mobile release:build
bun run --cwd apps/mobile test:native-smoke
bun run build
bun run typecheck
bun run lint
bun run docs:check
bunx prettier "apps/mobile/**/*.{ts,tsx,js,jsx,json,md}" "docs/applications/mobile.md" --check
```

## Work log

Narrowed from the mobile product epic identified by ADR-014; not claimed.

## Handoff

Pending.
