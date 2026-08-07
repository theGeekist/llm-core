---
architecture_version: 2
id: capabilities-context-artifacts
legacy_id: P1-210
title: Context manifest and artifact domains
stage: capabilities
status: done
priority: high
preferred_owner_kind: codex
owner: codex-context-artifacts
owner_kind: codex
lease_started_at: 2026-07-30T03:44:18+08:00
lease_expires_at: 2026-08-01T03:44:18+08:00
base_sha: e72d312e3f9d966acc2b96548c42b122498b3315
branch: task/P1-210-context-artifacts
worktree: /Users/jasonnathan/Repos/@theGeekist/llm-core/.worktrees/P1-210-context-artifacts
depends_on:
  - core-convergence
decision_dependencies:
  - ADR-001
  - ADR-003
  - ADR-005
conflicts_with: []
write_scope:
  - packages/llm-core/src/features/context/**
  - packages/llm-core/src/features/artifacts/**
  - packages/llm-core/tests/context/**
  - packages/llm-core/tests/artifacts/**
  - packages/llm-core/docs/final-architecture/tasks/capabilities-context-artifacts.md
required_reading:
  - path: docs/capabilities/context.md
    reason: "Preserve context manifest identity, authority and portability evidence."
  - path: docs/capabilities/artifacts.md
    reason: "Preserve artifact ownership and immutable reference semantics."
read_scope:
  - docs/capabilities/context.md
  - docs/capabilities/artifacts.md
  - packages/llm-core/src/contracts/**
  - packages/llm-core/src/features/evidence/**
review_owner: coordinator
updated_at: 2026-07-30
---

# capabilities-context-artifacts — Context manifest and artifact domains

## Objective

Introduce explicit, provider-neutral context and artifact domains after the core execution contracts have stabilized.

## Deliverables

- A `ContextManifest` with entries, provenance, scope, and budget metadata.
- Artifact contracts using the canonical `artifact` spelling.
- Feature public surfaces that do not expose provider SDK types.
- Focused tests for manifest construction, deterministic identity, and artifact references.

## Acceptance criteria

- Context is modeled as explicit input rather than hidden prompt assembly.
- Artifact identity and references follow ADR-003.
- The features import only contracts, shared utilities, or their own internals.
- Public export changes are proposed in the handoff for the integration owner.

## Verification

```sh
bun test packages/llm-core/tests/context packages/llm-core/tests/artifacts
bun run typecheck:packages
```

## Work log

- 2026-07-30T03:44:18+08:00 — Claimed by the Codex context/artifacts worker
  after core-convergence completed and merged at
  `e72d312e3f9d966acc2b96548c42b122498b3315`.
- 2026-07-30 — Implementation started. Applying ADR-001, ADR-003, and
  ADR-005 within the context and artifact feature write scope.
- 2026-07-30 — Implemented provider-neutral context manifest and artifact
  feature fronts at `b3a2471e767bb8cd2138ab13a5ec4718c57dd820`.
  Focused tests, package/test typechecks, contract schema check, lint,
  architecture tests, and diff hygiene pass; moved to review.
- 2026-07-30 — Independent review requested stricter inline binary integrity,
  UUID-authoritative derived-source uniqueness, and descriptor-safe nested
  contract validation. Remediated all three with adversarial coverage; focused
  tests now pass 15/15 alongside package/test typechecks, lint, architecture,
  schema, and diff-hygiene gates. Status remains review pending re-review.
- 2026-07-30 — Re-review found remaining accessor execution in nested JSON,
  digest and discriminant paths. Commits `48e92c7` and `8060c74` moved every
  affected boundary to descriptor-first validation and added zero-read
  adversarial tests.
- 2026-07-30 — Independently approved at exact SHA `8060c74`. Final
  verification passed with 18 focused tests, package and test typechecks,
  schema freshness, lint, 12 architecture tests, formatting and diff hygiene.
- 2026-07-30 — Integrated into `main` with dedicated `./context` and
  `./artifacts` fronts, internal aliases and build entry points. All 18 public
  runtime and declaration fronts passed the isolated packed-consumer gate.

## Handoff

### Result

- `ContextManifest` construction computes deterministic SHA-256 identities
  from strict canonical JSON, preserves entry order, rejects duplicate entry
  identities, and returns a cloned/deep-frozen value.
- `ContextScope`, `ContextProvenance`, and `ContextBudget` are closed,
  qualified portable contracts. Byte usage is deterministic: UTF-8 text,
  canonical JSON bytes, decoded binary length, or referenced resource length.
  Token usage is always explicit caller metadata; a token limit fails closed
  unless every entry supplies a token cost.
- `Artifact` and `ArtifactRef` use the canonical spelling. Artifact identity is
  the existing `ResourceRef.resourceId` UUID with its media type, byte length,
  and SHA-256 digest; no content-hash ID or physical locator was introduced.
- Both public fronts depend only on `#contracts` and feature-local internals.
  They expose no provider SDK, native handle, credential, path, URL, bucket,
  or storage-engine type.

### Commit and changed files

Implementation and review-remediation commits:
`b3a2471e767bb8cd2138ab13a5ec4718c57dd820`, `b3bb1cf`, `48e92c7`, and
`8060c74`.

- `packages/llm-core/src/features/artifacts/artifact.ts`
- `packages/llm-core/src/features/artifacts/public.ts`
- `packages/llm-core/src/features/artifacts/types.ts`
- `packages/llm-core/src/features/context/canonical.ts`
- `packages/llm-core/src/features/context/manifest.ts`
- `packages/llm-core/src/features/context/public.ts`
- `packages/llm-core/src/features/context/types.ts`
- `packages/llm-core/tests/artifacts/artifact.test.ts`
- `packages/llm-core/tests/context/manifest.test.ts`

### Verification

- `bun test packages/llm-core/tests/context packages/llm-core/tests/artifacts`
  — exit 0; 18 pass, 0 fail, 69 assertions.
- `bun run typecheck:packages` — exit 0, including deterministic contract
  schema check.
- `bun run typecheck:tests` — exit 0.
- `bun run lint` — exit 0.
- `bun test packages/llm-core/tests/architecture` — exit 0; 12 pass, 0 fail.
- `git diff --check` — exit 0.

### ADRs and risks

- Applied ADR-001 feature isolation and explicit `public.ts` fronts, ADR-003
  UUID/resource/digest identity and storage-neutral references, and ADR-005
  strict closed canonical inputs and fail-closed disclosure posture.
- No ADR deviations.
- Resource byte length and digest are reference claims; exact-byte
  verification remains the responsibility of an authorized resource resolver.
  No resolver or persistence implementation is added by this task.
- Context identity is sequence-sensitive by design because entry order is
  execution-significant. JSON object key order is canonicalized.

### Integration result

- Published context and artifacts through their explicit package subpaths.
  Their temporary private source aliases were removed at v2 convergence.
- Published `./context` and `./artifacts` as the capabilities-stage extension
  of ADR-008's core-stage
  sixteen-subpath surface.
- Added both public fronts to `PUBLIC_ENTRY_POINTS` in
  `packages/llm-core/scripts/build.ts`.
- Updated
  `packages/llm-core/tests/architecture/public-surface.characterization.test.ts`
  and package smoke expectations for the selected public subpaths.
- Did not add these feature contracts to the cross-language schema roots:
  ADR-001 keeps feature contracts outside the `src/contracts` ABI authority
  unless a later accepted decision promotes them.
