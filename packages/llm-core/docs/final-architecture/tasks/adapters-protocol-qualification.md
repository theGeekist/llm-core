---
architecture_version: 2
id: adapters-protocol-qualification
title: Publish exact A2A and stateless MCP protocol surfaces
stage: adapters
status: proposed
priority: critical
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
  - architecture-release-reproducibility
  - runtime-tools-front-boundary
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
  - packages/llm-core/scripts/build.ts
  - packages/llm-core/scripts/smoke-package.mjs
  - docs/adapters/index.md
  - docs/adapters/runtime-conformance.md
  - docs/reference/package-exports.md
  - packages/llm-core/docs/final-architecture/tasks/adapters-protocol-qualification.md
required_reading:
  - path: packages/llm-core/docs/final-architecture/EXTERNAL-CONTRACT-FIDELITY-IMPACT.md
    reason: "Apply the accepted exact-operation rule separately to A2A and MCP before selecting their recognised authorities and versions."
  - path: packages/aifsd/docs/final-architecture/INTEGRATIONS.md
    reason: "Preserve AIFSD composition ownership and the boundary between protocol engines, integration activation and application-specific bindings."
  - path: context/simple-chat/README.md
    reason: "Keep Simple Chat's scaffold-only status distinct from protocol conformance or implementation evidence."
  - path: context/simple-chat/docs/PLAN.md
    reason: "Deliver both protocol surfaces required by the selected downstream product without moving its coordinator semantics into llm-core."
  - path: context/simple-chat/docs/architecture/authority-map.md
    reason: "Interpret its working-tree ADRs and specifications as downstream reference material under their stated document roles."
  - path: context/simple-chat/docs/adr/0001-a2a-canonical-protocol.md
    reason: "Use the consumer's A2A choice as interoperability pressure while qualifying the official pinned A2A contract separately."
  - path: context/simple-chat/docs/protocols/a2a-profile.md
    reason: "Use concrete A2A identity, task, artefact, cancellation and streaming caveats."
  - path: context/simple-chat/docs/protocols/mcp-adapter.md
    reason: "Keep MCP as a stateless compatibility surface over canonical application state."
  - path: context/simple-chat/docs/adr/0004-stateless-mcp-adapter.md
    reason: "Retain the proposed stateless lifecycle rationale while correcting implementation ownership to llm-core plus an application binding."
read_scope:
  - packages/llm-core/docs/final-architecture/EXTERNAL-CONTRACT-FIDELITY-IMPACT.md
  - packages/aifsd/docs/final-architecture/INTEGRATIONS.md
  - context/simple-chat/README.md
  - context/simple-chat/docs/PLAN.md
  - context/simple-chat/docs/architecture/authority-map.md
  - context/simple-chat/docs/adr/0001-a2a-canonical-protocol.md
  - context/simple-chat/docs/adr/0004-stateless-mcp-adapter.md
  - context/simple-chat/docs/protocols/a2a-profile.md
  - context/simple-chat/docs/protocols/mcp-adapter.md
  - packages/llm-core/src/contracts/**
  - packages/llm-core/src/features/tooling/**
  - packages/llm-core/src/features/control/**
  - packages/llm-core/src/features/evidence/**
  - packages/llm-core/src/application/**
review_owner: coordinator
updated_at: 2026-08-08
---

# adapters-protocol-qualification — Publish exact A2A and stateless MCP protocol surfaces

## Objective

Implement, qualify and publish distinct A2A 1.0 and stateless MCP protocol
surfaces that AIFSD and Simple Chat can consume without reimplementing either
recognised protocol.

## In scope

- A version-pinned A2A 1.0 surface for Agent Cards, discovery, messages, tasks,
  parts, artefacts, send, streaming, subscription, cancellation, remote
  identity, delegation, errors and extension negotiation.
- A separately version-pinned stateless MCP surface for per-request lifecycle,
  tool and resource catalogues, application handler registration,
  authentication and authorisation hooks, controlled invocation, cancellation,
  errors and explicitly qualified legacy stateless compatibility when retained.
- Separate exact operation matrices, threat models and conformance fixtures for
  A2A and MCP. Sharing one task and release gate does not merge their native
  contracts or imply conversion between them.
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
- Public `@geekist/llm-core/a2a` and `@geekist/llm-core/mcp` subpaths, package
  build entrypoints, declarations, smoke coverage and isolated packed-consumer
  imports delivered in this task rather than deferred to an unnamed release
  task.
- An MCP application-binding boundary through which a trusted application host
  registers tool and resource schemas, handlers and request-level
  authorisation. The boundary carries application semantics without giving the
  protocol transport authority over them.

## Out of scope

- Treating an MCP server or A2A peer as trusted authorisation, remote-agent
  checkpoint portability, or a generic team API.
- Simple Chat channels, membership, coordinator sessions and generations,
  delivery leases, replay, idempotency policy, presence, receipts, catalogue
  contents or MCP-to-A2A application mapping. Those remain downstream
  application-binding semantics.
- AIFSD integration selection, activation, catalogue trust or product
  composition.

## Acceptance criteria

- Protocol metadata cannot bypass action digest, policy or approval checks.
- A2A state and delegation retain their remote/native owner unless an exact
  portable mapping is tested.
- A2A and MCP are independently importable, versioned and qualified; neither
  public surface is an alias, projection or lossy wrapper around the other.
- AIFSD and an isolated Simple Chat-shaped consumer can construct both public
  surfaces using only packed package exports and application-owned bindings.
- Every supported and unsupported operation plus its exact source version is
  declared before the corresponding package export is admitted.
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

2026-08-08: Corrected the sequence after downstream product review. A2A and
MCP remain distinct recognised protocols but share one task because their
direct dependencies, package manifest, lockfile, build entrypoints and packed
consumer gate are one write boundary. Removed the unrelated connector
authorisation lifecycle dependency, made the existing tools-front correction
the direct prerequisite, and brought both consumable subpaths into scope.

## Handoff

Pending.
