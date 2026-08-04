---
architecture_version: 2
id: core-contracts
legacy_id: P0-100
title: Implement narrow-waist contracts
stage: core
status: done
priority: critical
preferred_owner_kind: codex
owner: codex-root
owner_kind: codex
lease_started_at: 2026-07-29T16:04:54+08:00
lease_expires_at: 2026-07-30T16:04:54+08:00
base_sha: 4640a1fd7351c54bf965513cdfdfde53edce1825
branch: task/P0-100-codex
worktree: /Users/jasonnathan/Repos/@theGeekist/llm-core/.worktrees/P0-100-codex
depends_on:
  - architecture-decisions
decision_dependencies:
  - ADR-001
  - ADR-002
  - ADR-003
conflicts_with: []
write_scope:
  - package.json
  - bun.lock
  - packages/llm-core/package.json
  - packages/llm-core/tsconfig.contracts.json
  - packages/llm-core/scripts/generate-contract-schemas.ts
  - packages/llm-core/src/contracts/**
  - packages/llm-core/tests/contracts/**
  - packages/llm-core/docs/final-architecture/tasks/core-contracts.md
review_owner: coordinator
updated_at: 2026-07-29
---

# core-contracts — Implement Narrow-Waist Contracts

## Objective

Implement dependency-light identity, invocation, versioning, schema,
capability-claim and native-extension contracts with explicit public fronts.

## In scope

- JSON-compatible identity/reference types.
- `InvocationContext` without framework imports.
- Schema/version and extension conventions.
- Contract round-trip and unknown-extension tests.

## Out of scope

Feature contracts, root exports, provider factories and repository-wide
call-site migration.

## Acceptance criteria

- `src/contracts` imports only internal pure utilities when unavoidable.
- JSON fixtures round-trip and preserve namespaced extensions.
- Live/non-serializable values are excluded explicitly.
- Secret values cannot be placed in the portable context contract.

## Verification

```sh
bun test packages/llm-core/tests/contracts
bun run typecheck:packages
```

## Work log

- 2026-07-29T16:04:54+08:00 — Claimed by `codex-root` from
  `4640a1fd7351c54bf965513cdfdfde53edce1825`.
- 2026-07-29T16:06:00+08:00 — Began implementation in the dedicated task
  worktree. Child work is partitioned by disjoint contract/test paths.
- 2026-07-29T16:45:06+08:00 — Completed implementation and coordinator review.
  Three independent review slices checked schema/package topology,
  invocation/capability safety, and identity/versioning/public-front behavior.
  Review findings were resolved before final verification: reverse-DNS keys
  are enforced in generated schemas, invocation limits are constrained,
  InvocationContext has no raw-secret extension escape hatch, capability claims
  are evidence-backed discriminated unions, all portable identities are schema
  roots, runtime guards reject non-plain/extra-property values, and generated
  Draft 7 contracts are compiled and tested independently with Ajv.

## Handoff

Status: complete; ready for integration from `task/core-contracts-codex`.

### Contract front

- `src/contracts/public.ts` is the only feature-facing front and is available
  internally as `#contracts`.
- Portable identities are branded JSON strings. Existing core IDs accept
  canonical RFC 9562 UUIDs; new core IDs require UUIDv7.
- `InvocationContext` carries execution identity, authority, trace, deadline,
  budgets and opaque `SecretRef` values. It deliberately has no generic
  extensions field, preventing raw credentials or live native values from
  entering through an escape hatch.
- `PortableContent`, `ResourceRef` and `EvidenceRef` follow ADR-003 exactly and
  contain no physical storage locators.
- Capability claims are closed discriminated unions. A supported claim requires
  passing conformance evidence; conformance evidence contains an integrity-
  bearing, storage-neutral `EvidenceRef`; bindings require at least one claim.
- Unknown native extensions round-trip unchanged and both runtime guards and
  generated schemas require lowercase reverse-DNS namespaces.

### Schema authority

- Exact-pinned `ts-json-schema-generator@2.9.0` emits a deterministic Draft 7
  bundle from constrained TypeScript through `tsconfig.contracts.json`.
- Generated schema and exact-byte SHA-256 sidecar are checked in under
  `src/contracts/generated/`.
- Schema digest:
  `b7524be07a5f7d6c0a1f66b44d8039e490c425de4d5fd202fc5d9618b6303d45`.
- `typecheck:packages` and package `release:check` both run the schema freshness
  check, so the existing CI typecheck path detects generated drift.

### Verification

- `bun test packages/llm-core/tests/contracts` — 33 pass, 0 fail.
- `bun run typecheck:packages` — pass, including schema freshness.
- `bun run --cwd packages/llm-core release:check` — lint, typecheck, schema
  freshness and full package tests pass: 1,023 pass, 35 integration tests
  skipped for unavailable external services, 0 fail.
- `bun run build` — pass.
- `bun install --frozen-lockfile` — pass with no changes.
- `git diff --check` — pass.

### Integration notes

- Root/public npm exports remain intentionally unchanged; core-convergence owns public
  subpath convergence.
- core-model-runtime should import contracts through `#contracts`, pass
  `InvocationContext` separately from `ModelRequest`, and keep model resolution
  policy constraints separate from invocation context.
- Per ADR-004, `DeploymentRef` contains no credential. Credential resolution
  remains a composition/adapter concern; portable contracts expose only opaque
  `SecretRef` values.
- The optional `test:package` smoke command expects a pre-existing ignored
  `dist/` tree and therefore cannot run in a fresh isolated worktree after the
  current type-only build. Packaging/module-format cleanup remains assigned to
  core-ai-sdk-packaging/core-convergence and is not a core-contracts acceptance gate.
