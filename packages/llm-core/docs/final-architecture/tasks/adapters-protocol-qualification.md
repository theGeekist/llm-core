---
architecture_version: 2
id: adapters-protocol-qualification
title: MCP and A2A qualification boundary
stage: adapters
status: proposed
priority: medium
preferred_owner_kind: coordinator
owner:
owner_kind:
lease_started_at:
lease_expires_at:
base_sha:
branch:
worktree:
depends_on:
  - architecture-external-contract-fidelity
  - runtime-operation-contract-correction
  - architecture-source-layout-normalization
  - runtime-receipt-reconciliation
  - capabilities-operational-evidence
  - integrations-authorization-lifecycle
  - architecture-release-reproducibility
decision_dependencies:
  - ADR-005
  - ADR-006
  - ADR-007
  - ADR-013
  - ADR-014
  - ADR-015
  - ADR-017
conflicts_with:
  - adapter-strands-runtime
  - runtime-temporal-reference
  - runtime-tools-front-boundary
  - architecture-status-validation
  - adapter-openspec-release
  - adapter-pydantic-ai-release
  - adapter-ai-sdlc-release
  - adapter-spec-kit-release
  - adapter-bmad-release
  - adapter-strands-runtime-release
  - applications-client-subpath-release
  - applications-client-characterization
  - applications-client-platform-qualification
  - applications-desktop
  - applications-mobile
write_scope:
  - bun.lock
  - packages/llm-core/package.json
  - packages/llm-core/src/adapters/protocols/**
  - packages/llm-core/tests/adapters/protocols/**
  - docs/adapters/index.md
  - docs/adapters/runtime-conformance.md
  - packages/llm-core/docs/final-architecture/tasks/adapters-protocol-qualification.md
required_reading:
  - path: context/simple-chat/README.md
    reason: "Keep Simple Chat's scaffold-only status distinct from protocol conformance or implementation evidence."
  - path: context/simple-chat/docs/architecture/authority-map.md
    reason: "Interpret its working-tree ADRs and specifications as downstream reference material under their stated document roles."
  - path: context/simple-chat/docs/adr/0001-a2a-canonical-protocol.md
    reason: "Use the consumer's A2A choice as interoperability pressure while qualifying the official pinned A2A contract separately."
  - path: context/simple-chat/docs/protocols/a2a-profile.md
    reason: "Use concrete A2A identity, task, artefact, cancellation and streaming caveats."
  - path: context/simple-chat/docs/protocols/mcp-adapter.md
    reason: "Keep MCP as a stateless compatibility surface over canonical application state."
read_scope:
  - context/simple-chat/README.md
  - context/simple-chat/docs/architecture/authority-map.md
  - context/simple-chat/docs/adr/0001-a2a-canonical-protocol.md
  - context/simple-chat/docs/protocols/a2a-profile.md
  - context/simple-chat/docs/protocols/mcp-adapter.md
  - packages/llm-core/src/contracts/**
  - packages/llm-core/src/features/tooling/**
  - packages/llm-core/src/features/control/**
  - packages/llm-core/src/features/evidence/**
  - packages/llm-core/src/application/**
review_owner: coordinator
updated_at: 2026-08-03
---

# adapters-protocol-qualification — MCP and A2A qualification boundary

## Objective

Characterize MCP tools/resources and A2A peers behind the existing control,
identity, evidence and state boundaries before any public protocol adapter is
claimed.

## In scope

- Version-pinned exact operation matrices, threat models and conformance
  fixtures for MCP tool/resource operations and A2A remote-agent invocation.
- Exact current official A2A and MCP specifications, SDK versions and
  conformance sources added to `required_reading` before claim; mounted consumer
  material is context and never substitutes for upstream authority.
- Exact direct development dependencies on the qualified MCP and A2A SDKs in
  the package manifest and root lockfile. Source and tests must not rely on
  transitive dependencies.
- A task-owned
  `tests/adapters/protocols/external-consumer` fixture with its own manifest and
  lockfile, exact SDK pins and no root/workspace dependency fallback.
- MCP tool calls entering the normal schema, policy, approval, receipt and
  cancellation path.
- A2A remote identity, delegation, events, session/checkpoint and failure
  contracts that remain A2A-native unless an exact portable operation is
  separately proved.

## Out of scope

- Treating an MCP server or A2A peer as trusted authorization, publishing an
  adapter subpath, remote-agent checkpoint portability, or a generic team API.

## Acceptance criteria

- Protocol metadata cannot bypass action digest, policy or approval checks.
- A2A state and delegation retain their remote/native owner unless an exact
  portable mapping is tested.
- Every supported and unsupported operation plus its exact source version is
  declared before a separate publication task may add a package export.
- Package source and conformance fixtures resolve the same exact qualified SDK
  versions from direct dependency declarations.
- The external fixture performs a frozen install, asserts resolved package
  names and versions, and runs the supported MCP/A2A boundary checks.

## Verification

```sh
bun install --frozen-lockfile
bun install --cwd packages/llm-core/tests/adapters/protocols/external-consumer --frozen-lockfile
bun run qualify:external-fixtures
bun test packages/llm-core/tests/adapters/protocols
bun run typecheck:packages
bun run typecheck:tests
bun run lint
bun run --cwd packages/llm-core release:build
bun run test:package
bun run docs:check
bun run --cwd packages/llm-core format:check
```

## Work log

Planned from ADR-013 and hardened by ADR-014; not claimed.

## Handoff

Pending.
