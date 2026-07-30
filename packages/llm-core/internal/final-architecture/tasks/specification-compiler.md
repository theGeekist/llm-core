---
architecture_version: 2
id: specification-compiler
title: Specification review and compilation
stage: specifications
status: blocked
priority: high
preferred_owner_kind: coordinator
owner:
owner_kind: codex
lease_started_at:
lease_expires_at:
base_sha:
branch:
worktree:
depends_on:
  - specification-contracts
  - WPKERNEL-PIPELINE-RELEASE
decision_dependencies:
  - ADR-005
  - ADR-006
  - ADR-009
  - ADR-011
  - ADR-012
conflicts_with: []
write_scope:
  - packages/llm-core/src/application/specification-compiler/**
  - packages/llm-core/tests/specification-compiler/**
  - packages/llm-core/internal/final-architecture/tasks/specification-compiler.md
read_scope:
  - packages/llm-core/src/features/specifications/**
  - packages/llm-core/src/features/control/**
  - packages/llm-core/src/features/evidence/**
  - /Users/jasonnathan/Repos/@wpkernel/docs/packages/pipeline/**
review_owner: coordinator
updated_at: 2026-07-31
---

# specification-compiler — Specification review and compilation

## Objective

Review imported specification graphs and compile accepted intent into
purpose-specific dependency, workflow and execution plans while preserving the
authority boundaries beneath that simpler public journey.

## Deliverables

- Deterministic graph reconciliation and dependency resolution.
- Cycle reporting for dependency-only edges without rejecting valid cycles in
  the semantic graph or workflow program.
- Explicit admission outcomes: accepted, rejected or needs-input.
- Runtime registration of accepted specifications using module-private,
  unforgeable provenance.
- An application-owned `projectAcceptedSpecification` path with trusted clock,
  authority, policy and source-revision ports.
- A portable `ProjectionAuthoritySnapshot` bound into every projection result.
- A `ProjectionEnvelope<TProjection>` retaining projection identity, the
  accepted-specification binding and authority snapshot.
- A public `verifyProjectionAuthoritySnapshot` operation for controlled
  preparation/execution gateways.
- A target-neutral compiled plan that requires an
  `RegisteredAcceptedSpecification`.
- Pure, per-invocation Pipeline orchestration using immutable replacement
  output, typed around-continuations and the public typed custom-stage
  dependency facade.

## Acceptance criteria

- Import cannot trigger effects or mint an accepted specification.
- A portable `SpecificationDecisionRecord`, reconstructed object or TypeScript
  cast cannot satisfy the projector's runtime admission check.
- Admission completion or record verification rechecks authority, expiry,
  source revision, resolved digest, scope and policy versions immediately
  before adding the exact frozen value to a module-private provenance registry.
- Registration is not treated as continuing validity. Every projection obtains
  a consistent current authority/policy/source snapshot, checks expiry at the
  final synchronous boundary and fails closed before invoking the adapter when
  any admitted binding has changed.
- Projectors cannot be invoked through the public application surface without
  use-time revalidation, and projection results bind the validated snapshot for
  later preparation/execution checks.
- `verifyProjectionAuthoritySnapshot` rejects changed expiry, authority, policy,
  source revision, resolved digest or scope using trusted current-state ports.
- Extracting the raw projection from its envelope does not preserve
  `llm-core` execution authority.
- Deserialization and process restart require admission verification and
  registration again.
- Compiler helpers perform no external commit and register no durable rollback.
- Every invocation owns its Pipeline instance and diagnostics.
- Pipeline pause state is absent from portable compiler results.
- Synchronous stages preserve synchronous completion; async adapters preserve
  `MaybePromise`.
- The custom stage sequence imports only documented public WPKernel types and
  compiles without dependency-interface recreation or casts.
- Inline `createStages` inference uses the released root
  `PipelineStageDependencies` type family verified by WPKernel's
  `qualify:packed` gate.
- The implementation records the exact released WPKernel capability baseline
  it compiles against.

## Verification

```sh
bun test packages/llm-core/tests/specification-compiler
bun run typecheck:packages
bun run typecheck:tests
bun run lint
```

Focused tests include registration followed by expiry, policy-version change
and source-revision advancement before projection. All three must reject
without invoking the target projector.

## Work log

WPKernel Phases 1 through 6 are implemented and packed-qualified. Blocked
pending specification-contracts and reconciliation of Pipeline's stale local `1.0.0` manifest
with published `1.1.0`, followed by a forward exact release and `llm-core`
qualification against that released artifact.

## Handoff

Pending.
