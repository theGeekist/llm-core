---
architecture_version: 1
id: strict-json-foundation
title: Establish the strict-json package and strict boundary contract
stage: core
status: done
priority: critical
owner: codex-root
owner_kind: codex
lease_started_at: 2026-08-06T15:04:45+08:00
lease_expires_at: 2026-08-07T15:04:45+08:00
base_sha: 3e15a3f9facbb74ebcc7584c6c8259ea7145a9d3
branch: main
worktree: /Users/jasonnathan/Repos/@theGeekist/llm-core
depends_on: []
decision_dependencies: []
conflicts_with:
  - configuration-manifest-characterization
write_scope:
  - package.json
  - scripts/qualify-release.ts
  - scripts/qualify-release.test.ts
  - scripts/check-sloc.ts
  - scripts/check-sloc.test.ts
  - scripts/check-sloc-mounts.test.ts
  - tsconfig.json
  - packages/strict-json/**
  - packages/llm-core/package.json
  - packages/llm-core/src/features/context/canonical.ts
  - packages/llm-core/src/features/tooling/**
  - packages/llm-core/tests/language/v1-inventory-public-exports.mjs
  - packages/llm-core/tests/tooling/canonical-json.test.ts
  - packages/aifsd/package.json
  - packages/aifsd/README.md
  - packages/aifsd/src/config/content-digest.ts
  - packages/aifsd/src/config/portable-data.ts
  - packages/aifsd/tests/config/**
  - bun.lock
review_owner: human
updated_at: 2026-08-10
---

# strict-json-foundation

## Objective

Create the consumer-neutral strict-json package earned by the independent
reusable-abstraction reviews, with an explicit hostile-input and canonical-byte
contract.

## In scope

- Strict JSON value types, validation and normalisation.
- RFC 8785 canonicalisation after package-owned strict preflight.
- Detached frozen snapshots and cycle-safe descriptor-based freezing.
- Stable package-owned failure codes.
- Package-local unit, adversarial, build and packed-consumer evidence.

## Out of scope

- A vague shared utility surface.
- AI, AIFSD configuration or adapter policy.
- MaybePromise, retries, timestamps, paths, telemetry or test fixtures.
- Consumer manifests and root configuration while the active AIFSD configuration
  task owns them. The only permitted lockfile edit is the approved workspace
  package rename.

## Acceptance criteria

- The package has one published root entrypoint and no dependency on llm-core or AIFSD.
- Input methods and accessors are not invoked during normalisation.
- Proxy trap failures become stable package-owned failures.
- Canonical output is deterministic, independent of ambient array prototype
  hooks and matches the pinned development serializer for all accepted values.
- Snapshots are detached and recursively frozen.
- Snapshot and freeze return types expose their runtime immutability.
- Unsafe integers, non-finite numbers, lone surrogates, cycles, sparse arrays,
  extended arrays, symbol keys, live objects and prototype-bearing records fail closed.
- `__proto__`, `constructor` and `prototype` remain ordinary own data keys in
  accepted records and canonical bytes.

## Verification

```sh
bun run --cwd packages/strict-json release:build
```

## Work log

Execution mode: shared-checkout

Execution rationale: package-local paths are disjoint from the active AIFSD task.

Concurrency evaluation: configuration-manifest-characterization; start package-local
construction alongside it and wait before consumer or lockfile integration.

Concurrent task scopes: configuration-manifest-characterization owns
`packages/aifsd/**` configuration paths and the substantive lockfile integration;
this task owns `packages/strict-json/**` plus the exact old-to-new workspace name
and path substitution in `bun.lock`.

Swarm delegation: codex-root -> Codex package-conventions, canonical-parity and
snapshot-inventory agents; read-only evidence returned to the primary owner.

Package-local qualification: passed on 2026-08-06 with 28 unit, adversarial and
property tests, source and test typechecking, lint, format verification, ESM and
declaration builds, plus `npm pack` installation into a clean NodeNext consumer.

Integration disposition: keep this task `in_progress` and uncommitted for human
review. The user explicitly transferred the consumer and workspace integration
scope after the AIFSD human-review pass, so root, llm-core and AIFSD wiring now
belongs to this implementation.

Naming decision: human review rejected the `portable-data` vocabulary as foreign
and selected `@geekist/strict-json`. Function exports rely on package context
(`canonicalize`, `normalize`, `snapshot`, `deepFreeze`, `isRecord`); public data
types retain explicit `Json` names to avoid ambiguous imports.

Lockfile coordination: the active AIFSD task added the original workspace entry
after package-local qualification. The approved rename changes only that entry's
package path and identity; every other concurrent lockfile edit is preserved.

Post-human-review AIFSD refresh: the local `config/maybe.ts` has been removed in
favour of descriptor-safe `@wpkernel/pipeline` 1.2.1 primitives; `diagnostic.ts`
and stable `reasonCode` values now own renderer-neutral failures; `explain.ts`, a
catalog-admission snapshot and an explicit pre-resolver catalogue freeze were
added. The strict-json consumer migration therefore preserved AIFSD's diagnostic
wrapper and current freeze timing: `content-digest.ts` now uses `canonicalize`,
while `portable-data.ts` uses `normalize` and delegates its local valid-graph
freezer to `deepFreeze`. Replacing the wrapper wholesale with `snapshot` remains
deferred until immediate freezing and alias detachment are deliberately accepted.

Integration requirements were to add the strict-json workspace dependency and
runtime external to AIFSD, build strict-json before AIFSD's isolated package
smoke, add the root TypeScript path and build ordering, and retain SHA-256,
`Digest`, closure ordering, `SecretRef`, credential scanning and diagnostic
policy with their existing owners. The human-review baseline passed 275 tests,
908 expectations, typecheck and lint before migration.

Consumer integration: llm-core now imports the terse strict-json operations
directly and has removed its duplicate tooling implementation, old runtime
aliases and duplicate context serializer. AIFSD now delegates canonicalisation,
normalisation and valid-graph freezing while retaining AIFSD diagnostics,
SecretRef policy and its deliberate later freeze boundary. Regression coverage
pins null-prototype acceptance, custom-array-prototype rejection and hostile
inspection failures without thrown-value coercion. Package and repository-wide
qualification evidence is recorded after final reconciliation.

Review hardening: package-owned serialization now avoids the pinned reference
serializer's inherited `toJSON`, `map`, `join` and sorting behaviour. The
reference dependency is development-only and remains covered by generated
parity tests. Packed output includes the linked contract, the Node smoke runs
plain JavaScript rather than relying on type stripping, frozen results expose
deeply readonly public types, and release topology provides an independent
strict-json tag while preventing llm-core publication until that exact registry
version exists.

Final reconciliation qualification: frozen install and ordered root build pass;
package, example, documentation-snippet and test typechecking pass; repository
lint passes; strict-json's package suite passes 28 tests and its release build
installs the packed package in a clean consumer; the aggregate repository suite
passes 1,030 tests with four explicitly skipped external fixtures; AIFSD's
isolated public-front suite passes 3 tests; the llm-core smoke installs packed
strict-json and llm-core tarballs together and verifies 29 ESM exports and their
declarations; documentation checks verify 41 public pages, 143 package
engineering pages, six routing pages and 23 snippets. The SLOC gate now ignores
only the explicitly optional `packages/aifsd/docs` private-authority mount,
proven by a focused symlink regression, and measures 438 source modules at the
500-line limit.

2026-08-10: Human review was confirmed complete. The package is now named
`@aifsd/strict-json@0.1.0`; its independent release qualification passes 31
tests with 279 assertions, declaration and distribution emission, formatting,
and an isolated packed-package consumer. Publication remains a separate release
operation and has not occurred.
