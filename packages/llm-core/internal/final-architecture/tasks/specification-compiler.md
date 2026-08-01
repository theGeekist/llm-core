---
architecture_version: 2
id: specification-compiler
title: Specification review and compilation
stage: specifications
status: done
priority: high
preferred_owner_kind: coordinator
owner: codex-specification-compiler-review
owner_kind: codex
lease_started_at: 2026-08-01T08:01:21+08:00
lease_expires_at: 2026-08-02T08:01:21+08:00
base_sha: 89cd5720256969917750a9b72cba03894fde77d2
branch: task/specification-compiler-review
worktree: /Users/jasonnathan/Repos/@theGeekist/llm-core/.worktrees/specification-compiler-review
depends_on:
  - specification-contracts
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
updated_at: 2026-08-01
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
- Explicit review outcomes: accepted, rejected or needs-input.
- Runtime registration of accepted specifications using module-private,
  unforgeable provenance.
- An application-owned `compileSpecification` path with trusted clock,
  authority, policy and source-revision ports.
- An internal `CompilationAuthoritySnapshot` bound into every compiled result.
- A `CompiledSpecification<T>` retaining compilation identity, the
  accepted-specification binding and authority snapshot.
- An internal `verifyCompilationAuthority` operation for controlled
  preparation/execution gateways.
- A target-neutral compiled plan that requires an
  `AcceptedSpecificationHandle`.
- Pure, per-invocation Pipeline orchestration using immutable replacement
  output, typed around-continuations and the public typed custom-stage
  dependency facade.

## Acceptance criteria

- Import cannot trigger effects or mint an accepted specification.
- A portable `SpecificationDecisionRecord`, reconstructed object or TypeScript
  cast cannot satisfy the compiler's runtime decision check.
- Review completion or record verification rechecks authority, expiry,
  source revision, resolved digest, scope and policy versions immediately
  before adding the exact frozen value to a module-private provenance registry.
- Registration is not treated as continuing validity. Every compilation obtains
  a consistent current authority/policy/source snapshot, checks expiry at the
  final synchronous boundary and fails closed before invoking the adapter when
  any accepted binding has changed.
- Compilers and adapters cannot be invoked through the public application
  surface without use-time revalidation, and compiled results bind the
  validated snapshot for
  later preparation/execution checks.
- `verifyCompilationAuthority` rejects changed expiry, authority, policy,
  source revision, resolved digest or scope using trusted current-state ports.
- Extracting the raw value from `CompiledSpecification<T>` does not preserve
  `llm-core` execution authority.
- Deserialization and process restart require decision verification and
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
and source-revision advancement before compilation. All three must reject
without invoking the target compiler or adapter.

## Work log

WPKernel Pipeline 1.2.0 is published, pinned exactly and packed-qualified by
`llm-core`: the release build passed 515 tests with one optional compatibility
skip, and the isolated consumer verified all 19 ESM runtime and declaration
entrypoints.

- 2026-08-01 — Promoted to ready after `specification-contracts` completed at
  `74863b4`. No recorded compiler blocker remains.
- 2026-08-01 — Claimed on `task/specification-compiler` from `d95ab3d`.
- 2026-08-01 — Implementation started after the task claim was recorded.
- 2026-08-01 — Implemented at `a54c4cd`: deterministic review/resolution,
  process-local accepted provenance, authority-bound compilation, final async
  revalidation, and a fresh WPKernel Pipeline per invocation. Independent
  review found and confirmed fixes for three P1 authority/scope gaps.
- 2026-08-01 — Coordinator integrated the reviewed task at `7c68f6f`; the
  receiving focused compiler test passed.
- 2026-08-01 — Reopened for scoped dependency-cycle review and conversion-report
  loss-accounting remediation from `89cd572`.
- 2026-08-01 — Remediated at `57b705a`: dependency cycles now block only the
  accepted scope, and rejected conversion semantics remain visible and block
  the scope they affect. All task verification gates passed.
- 2026-08-01 — Coordinator integrated the reviewed remediation at `06ac306`;
  the receiving focused compiler test passed.

## Handoff

Completed and integrated by the coordinator.

- Implementation: `57b705a` (`fix(specifications): scope review blockers`)
- Main integration: `06ac306`
- Worktree: clean at the implementation commit before this review-state record.
- Changed files:
  - `packages/llm-core/src/application/specification-compiler/resolution.ts`
  - `packages/llm-core/tests/specification-compiler/compiler.test.ts`
  - this task file
- Verification (all exit 0): `bun test packages/llm-core/tests/specification-compiler`
  (8 pass); `bun run typecheck:packages` (including
  `contracts:schema:check`); `bun run typecheck:tests`; `bun run lint`; the
  task-file Prettier check; and `git diff --check`.
- Applied ADRs: ADR-005, ADR-006, ADR-009, ADR-011 and ADR-012. WPKernel uses
  the pinned, packed-qualified `@wpkernel/pipeline@1.2.0` root public API.
- Remaining boundary: this slice does not publish package metadata or integrate
  compilation authority into agent/workflow preparation, execution or resume;
  `specification-authority` owns those enforcement points.
- No shared-file changes are requested from the integration owner.
