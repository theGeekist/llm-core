---
architecture_version: 2
id: applications-desktop
title: Desktop application foundation
stage: applications
status: cancelled
replaced_by:
  - aifsd/clients-desktop-foundation
priority: medium
preferred_owner_kind: codex
owner:
owner_kind:
lease_started_at:
lease_expires_at:
base_sha:
branch:
worktree:
depends_on:
  - architecture-source-layout-normalization
  - applications-client-subpath-release
decision_dependencies:
  - ADR-006
  - ADR-014
  - ADR-015
  - ADR-016
conflicts_with:
  - applications-mobile
  - architecture-release-reproducibility
  - adapter-strands-runtime-release
  - adapter-strands-runtime
  - runtime-temporal-reference
  - adapters-protocol-qualification
  - architecture-status-validation
write_scope:
  - package.json
  - bun.lock
  - apps/desktop/**
  - docs/applications/desktop.md
  - packages/llm-core/docs/final-architecture/tasks/applications-desktop.md
required_reading:
  - path: packages/aifsd/docs/final-architecture/LLM-CORE-PARITY.md
    reason: "Retain the cancelled desktop brief as cross-authority provenance."
  - path: packages/aifsd/docs/final-architecture/tasks/clients-desktop-foundation.md
    reason: "Use the committed AIFSD desktop task as current product authority."
read_scope:
  - packages/aifsd/docs/final-architecture/LLM-CORE-PARITY.md
  - packages/aifsd/docs/final-architecture/tasks/clients-desktop-foundation.md
  - packages/llm-core/src/client/**
  - packages/llm-core/package.json
review_owner: coordinator
updated_at: 2026-08-04
---

# applications-desktop — Desktop application foundation

Cancelled by ADR-016 before implementation. Desktop is a downstream product
choice after delivery and runtime use cases are proven.
The committed AIFSD replacement retains a distinct desktop framework, security,
packaging and release decision.

## Objective

Establish one production-shaped desktop application shell, framework decision
and dependency/release baseline before product capabilities are implemented.

## In scope

- A recorded desktop framework/package choice with supported-OS, update,
  signing, sandbox, native-dependency and release implications.
- A minimal executable app shell importing only `@geekist/llm-core/client`, with
  one fake-host health/read journey and no product capability abstraction.
- Package-local build, typecheck, unit test, pack and isolated smoke commands.
- Root build/typecheck integration so the default repository gates cannot skip
  the desktop workspace.
- A follow-on decomposition for authentication/secure storage, synchronization,
  operator surfaces, local profiling/hosting and release qualification.

## Out of scope

- OAuth implementation, secure-store implementation, conversations, approvals,
  connector management, cost/budget/routing UI, local hosting, signing or
  production release.

## Acceptance criteria

- The framework decision compares at least runtime security, native dependency,
  signing/update, minimum-OS and test/pack implications.
- The shell runs and typechecks without importing kernel source or feature
  internals and the isolated smoke consumes the packed local package.
- Root `bun.lock` is updated by a frozen-installable dependency graph.
- Root build and typecheck gates execute the desktop foundation.
- Follow-on product tasks are bounded independently; this foundation task does
  not become a full application implementation task.
- New hand-written source/test modules satisfy the 500-SLOC rule; inherited
  exceptions require a coordinator waiver and named decomposition follow-up.

## Verification

```sh
bun install --frozen-lockfile
bun run --cwd apps/desktop release:build
bun run --cwd apps/desktop test:package
bun run build
bun run typecheck
bun run lint
bun run docs:check
bunx prettier "apps/desktop/**/*.{ts,tsx,js,jsx,json,md}" "docs/applications/desktop.md" --check
```

## Work log

Narrowed from the desktop product epic identified by ADR-014; not claimed.

## Handoff

Pending.
