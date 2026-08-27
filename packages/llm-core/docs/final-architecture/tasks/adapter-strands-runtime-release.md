---
id: adapter-strands-runtime-release
title: Publish qualified Strands runtime adapter
stage: adapters
status: proposed
priority: medium
depends_on:
  - architecture-external-contract-fidelity
  - architecture-runtime-ownership-correction
  - runtime-operation-contract-correction
  - architecture-source-layout-normalization
  - adapter-strands-runtime
decision_dependencies:
  - ADR-007
  - ADR-013
  - ADR-015
  - ADR-016
  - ADR-017
conflicts_with:
  - adapter-openspec-release
  - adapter-pydantic-ai-release
  - adapter-ai-sdlc-release
  - adapter-spec-kit-release
  - adapter-bmad-release
  - runtime-temporal-reference
  - adapters-protocol-qualification
  - runtime-tools-front-boundary
  - architecture-status-validation
  - applications-client-characterization
  - applications-client-platform-qualification
  - applications-client-subpath-release
  - applications-desktop
  - applications-mobile
  - architecture-legacy-functional-removal
write_scope:
  - scripts/release-qualifiers.json
  - bun.lock
  - packages/llm-core/package.json
  - packages/llm-core/scripts/build.ts
  - packages/llm-core/scripts/smoke-package.mjs
  - packages/llm-core/tsconfig.json
  - packages/llm-core/tsconfig.build.json
  - packages/llm-core/tests/architecture/**
  - docs/reference/package-exports.md
  - docs/adapters/runtime-conformance.md
  - packages/llm-core/docs/final-architecture/tasks/adapter-strands-runtime-release.md
required_reading:
  - path: context/aifsd-research/profiles/strands-agents.md
    reason: "Preserve the exact researched SDK and platform boundary in the support declaration."
  - path: docs/reference/package-exports.md
    reason: "Use the sealed export surface as publication evidence."
read_scope:
  - context/aifsd-research/profiles/strands-agents.md
  - docs/reference/package-exports.md
  - packages/llm-core/src/adapters/runtimes/strands/**
  - packages/llm-core/tests/adapters/runtimes/strands/**
  - packages/llm-core/tests/conformance/strands/**
review_owner: coordinator
updated_at: 2026-08-04
---

# adapter-strands-runtime-release — Publish qualified Strands runtime adapter

## Objective

Publish a qualified Strands runtime front only after adapter conformance,
support declarations and documentation make its exact boundary truthful.

## Deliverables

- Package, build, declaration and source-resolution entries.
- Updated public-surface and package-smoke expectations.
- Public support documentation naming the exact qualified Strands release,
  native boundary, exact operation matrix, Python/TypeScript scope and
  durability posture.
- A support declaration naming the maintenance owner, the exact upstream
  version and package-release window supported, and the deprecation policy.
- An explicit dependency posture for `@strands-agents/sdk` (peer, optional peer
  or structurally injected native boundary), with matching manifest and lockfile
  evidence where package metadata changes.
- Runtime and declaration verification of the exact Strands subpath from an
  isolated packed consumer.
- A durable qualifier registration for the declared Strands version/window.

## Acceptance criteria

- The new qualified subpath exposes only portable contracts plus the documented
  native boundary and does not change the root package entry.
- Runtime and declaration imports pass in an isolated packed consumer.
- The package smoke fixture imports the exact Strands subpath at runtime and
  through its generated declarations; an unregistered or missing export fails
  the gate.
- The isolated consumer installs the exact supported Strands SDK independently,
  asserts its resolved version and exercises the native boundary without using
  a workspace or transitive-root copy.
- Documentation names the maintenance owner, exact supported Strands version
  and package-release window, supported and unsupported operations,
  Python/TypeScript scope, durability posture and deprecation policy.
- Publication commits the project to supporting the declared exact version for
  that window. Support for later Strands versions remains demand-led and
  requires new qualification evidence.
- The canonical release gate executes the registered Strands qualifier on every
  later package release and fails if it is absent, skipped or failing.
- Release build, package smoke, documentation and formatting gates pass.

## Verification

```sh
bun run check:sloc
bun run qualify:external-fixtures
bun run --cwd packages/llm-core release:build
bun run test:package
bun run docs:check
bun run --cwd packages/llm-core format:check
bun run release:qualify:llm-core
```

## Work log

Planned from ADR-013; publication boundary reconciled with ADR-016; not
claimed.

## Handoff

Pending.
