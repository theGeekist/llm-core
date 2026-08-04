---
architecture_version: 2
id: applications-client-platform-qualification
title: Prequalify client platforms and build the packed-package gate
stage: applications
status: cancelled
forward_to:
  - aifsd/build-runtime-vertical-slice
priority: high
preferred_owner_kind: coordinator
owner:
owner_kind:
lease_started_at:
lease_expires_at:
base_sha:
branch:
worktree:
depends_on:
  - architecture-source-layout-normalization
  - applications-client-contract
  - architecture-release-reproducibility
decision_dependencies:
  - ADR-007
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
  - apps/client-platform-qualification/**
  - packages/llm-core/tests/applications/platform-qualification/**
  - docs/applications/client-platform-qualification.md
  - packages/llm-core/docs/final-architecture/tasks/applications-client-platform-qualification.md
read_scope:
  - packages/llm-core/package.json
  - packages/llm-core/scripts/build.ts
  - packages/llm-core/src/client/**
  - packages/llm-core/tests/client/**
review_owner: coordinator
updated_at: 2026-08-04
---

# applications-client-platform-qualification — Prequalify client platforms and build the packed-package gate

Cancelled by ADR-016 before implementation. Platform qualification follows an
evidence-backed product boundary rather than defining one in advance.

## Objective

Prequalify the unpublished client source across Node, browser and mobile, and
build the reusable tarball-driven harness that the later release task must run
against the final exported package before support is authorized.

## In scope

- A source-prequalification mode using task-owned Node, browser-bundler and
  React Native/Metro fixtures compiled from the candidate `src/client` entry
  without publishing it. The fixture manifests pin exact direct React Native,
  Metro, TypeScript and bundler dependencies with frozen lockfiles.
- A separate packed mode that accepts a package directory, packs it after its
  release build, installs only that tarball into isolated Node, browser-bundler
  and Metro consumers, and imports the public `@geekist/llm-core/client`
  runtime and declarations without source/workspace fallback.
- Harness tests using safe and deliberately broken fixture tarballs so missing
  exports, Node-targeted browser output and declaration leakage fail before the
  real client subpath exists.
- Static and executable checks for Node built-ins, conditional exports,
  environment globals, dependency reachability and declaration portability.
- An explicit decision on package `engines`, build target and export-condition
  posture for the eventual client subpath.
- A precise React Native client-support statement: qualification covers using
  the portable `./client` runtime and declarations from React Native through
  the declared Metro/version window. It does not claim UI components, native
  modules, secure storage, deep-link/OAuth callbacks, background execution or a
  complete React Native application SDK.
- A preliminary same-package/split recommendation. Source success is not
  publication authority; the later packed run is decisive.

## Out of scope

- Publishing `./client`, claiming packed-package compatibility before the
  release task, choosing the final desktop/mobile UI framework, implementing
  native adapters or creating a separate package automatically.

## Acceptance criteria

- Source-mode Node, browser and mobile fixtures use the same candidate client
  entry and reject source imports outside that entry.
- Browser/mobile qualification detects Node-only imports and dependencies even
  when a Node test consumer would pass.
- The React Native fixture runs Metro resolution/bundling and an executable
  consumer against the exact pinned React Native and Metro versions; a
  TypeScript-only compile is insufficient.
- The report explains whether `engines.node >=22`, the Node build target and
  current package conditions are truthful for all declared consumers.
- A source incompatibility blocks `applications-client-subpath-release` and
  records the precise ADR-015 split or conditional-export pressure; it is not
  waived merely to preserve the one-package preference.
- Packed mode takes no source entry argument and fails if a consumer resolves a
  workspace, root dependency or file outside the installed tarball.
- Harness tests prove the packed mode detects broken runtime exports,
  browser/mobile Node dependencies and declaration entrypoints.
- Every consumer owns a frozen dependency graph. The later release task must
  rerun packed mode against the final package; source-mode success alone never
  permits publication.

## Verification

```sh
bun install --frozen-lockfile
bun test packages/llm-core/tests/applications/platform-qualification
bun run --cwd apps/client-platform-qualification qualify:source
bun run --cwd apps/client-platform-qualification test:packed-harness
bun run typecheck:tests
bun run lint
bun run docs:check
bunx prettier "apps/client-platform-qualification/**/*.{ts,tsx,js,jsx,json,md}" "docs/applications/client-platform-qualification.md" --check
```

## Work log

Added after review found that Node-only package qualification preceded the
first actual mobile consumer, then hardened so source prequalification cannot
stand in for final tarball evidence; not claimed.

## Handoff

Pending.
