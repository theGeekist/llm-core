---
architecture_version: 2
id: applications-client-subpath-release
title: Qualify and publish the shared client subpath
stage: applications
status: cancelled
replaced_by:
  - aifsd-delivery-toolchain
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
  - applications-client-platform-qualification
decision_dependencies:
  - ADR-007
  - ADR-012
  - ADR-014
  - ADR-015
  - ADR-016
conflicts_with:
  - architecture-status-validation
  - runtime-tools-front-boundary
  - adapter-openspec-release
  - adapter-pydantic-ai-release
  - adapter-ai-sdlc-release
  - adapter-spec-kit-release
  - adapter-bmad-release
  - adapter-strands-runtime-release
  - adapter-strands-runtime
  - runtime-temporal-reference
  - adapters-protocol-qualification
  - architecture-legacy-functional-removal
write_scope:
  - scripts/release-qualifiers.json
  - packages/llm-core/package.json
  - packages/llm-core/scripts/build.ts
  - packages/llm-core/scripts/smoke-package.mjs
  - packages/llm-core/tsconfig.json
  - packages/llm-core/tsconfig.build.json
  - packages/llm-core/tests/architecture/**
  - docs/reference/package-exports.md
  - docs/applications/client.md
  - packages/llm-core/internal/final-architecture/tasks/applications-client-subpath-release.md
read_scope:
  - apps/client-platform-qualification/**
  - packages/llm-core/src/client/**
  - packages/llm-core/tests/client/**
review_owner: coordinator
updated_at: 2026-08-04
---

# applications-client-subpath-release — Qualify and publish the shared client subpath

Cancelled by ADR-016 before implementation. No shared client subpath is
published until unlike real consumers establish a stable contract.

## Objective

Expose the characterized shared client contract through
`@geekist/llm-core/client` without creating a second package or broadening the
package root.

## Deliverables

- Package, build, declaration and source-resolution entries for `./client`.
- Updated architecture expectations, package smoke and public documentation.
- A support declaration naming the maintenance owner, package-release window
  and deprecation policy.
- A durable release-qualifier registration naming the exact supported React
  Native and Metro versions/window and invoking the packed Node, browser and
  React Native consumers on every later llm-core publication.

## Out of scope

- A separate `llm-client` package, UI components, platform-native adapters or
  publishing any uncharacterized product behavior.

## Acceptance criteria

- The root export remains unchanged and the client contract is available only
  through the explicit `./client` subpath.
- Package engine, build-target and export conditions match the source
  prequalification result. Publication stops if it identified an unresolved
  ADR-015 split trigger.
- After this task changes the export/build/package configuration, the reusable
  platform harness packs that exact post-build package and installs only its
  tarball into isolated Node, browser-bundler and Metro consumers.
- Those packed consumers import the public `@geekist/llm-core/client` runtime
  and declarations and fail on source paths, workspace links, root dependency
  fallback, Node-only browser/mobile output or missing export conditions.
- React Native support means the portable client runtime and declarations are
  consumable through the declared Metro/React Native versions. It does not add
  or promise native modules, UI components, secure storage, OAuth/deep-link
  adapters, background execution or application lifecycle behavior.
- The package smoke packs the exact local `llm-core`, installs that tarball into
  a fresh project outside the workspace and verifies every curated client
  runtime and declaration import without source, workspace-link or root
  dependency fallback.
- Client declarations expose transport/application DTOs and ports, not feature
  internals, credentials, runtime-native handles or execution authority.
- Documentation names the maintenance owner, package-release window and
  deprecation policy. A later separate-package proposal still requires a
  measured ADR-015 split trigger.
- Complete release, isolated package, documentation and formatting gates pass.
- `scripts/release-qualifiers.json` registers the packed platform harness under
  `./client`; the canonical release command fails if the registration is
  missing, skipped or failing. A regression test simulates a later unrelated
  package release and proves that browser and React Native/Metro breakage still
  blocks publication.

## Verification

```sh
bun install --frozen-lockfile
bun run check:sloc
bun run qualify:external-fixtures
bun run --cwd packages/llm-core release:build
bun run --cwd apps/client-platform-qualification qualify:packed -- ../../packages/llm-core
bun run test:package
bun run docs:check
bun run --cwd packages/llm-core format:check
bun run release:qualify:llm-core
```

## Work log

Planned from ADR-014 and ADR-015, then hardened to require post-export packed
Node/browser/Metro evidence; blocked on the client contract and not claimed.

## Handoff

Pending.
