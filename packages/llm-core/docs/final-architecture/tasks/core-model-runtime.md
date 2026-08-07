---
architecture_version: 2
id: core-model-runtime
legacy_id: P0-120
title: Implement model and profile vertical slice
stage: core
status: done
priority: critical
preferred_owner_kind: claude-code
owner: Claude Code
owner_kind: claude-code
lease_started_at: 2026-07-29T16:48:00+08:00
lease_expires_at: null
base_sha: 6e8e6a5
branch: task/P0-120-claude
worktree: /Users/jasonnathan/Repos/@theGeekist/llm-core/.worktrees/P0-120-claude
depends_on:
  - core-contracts
decision_dependencies:
  - ADR-002
  - ADR-003
  - ADR-004
conflicts_with: []
write_scope:
  - packages/llm-core/src/features/model/**
  - packages/llm-core/tests/model/**
  - packages/llm-core/docs/final-architecture/tasks/core-model-runtime.md
required_reading:
  - path: docs/capabilities/model.md
    reason: "Preserve model profile, resolution and native provider ownership evidence."
  - path: packages/llm-core/docs/v1-implementation-plan.md
    reason: "Identify the pre-v2 provider coupling removed by the model slice."
    ref: 8844ac3989e497a762fa43f23fd93e40803d2174
read_scope:
  - docs/capabilities/model.md
  - packages/llm-core/docs/v1-implementation-plan.md
review_owner: coordinator
updated_at: 2026-07-29
---

# core-model-runtime — Implement Model and Profile Vertical Slice

## Objective

Implement neutral model request/response, provider/deployment references,
evidence-backed model profiles and registry-driven resolution using the builtin
model as the first executable path.

## In scope

`ModelRequest`, `ModelResponse`, provider metadata, model/profile references,
capability requirements/claims, resolver port and builtin model tests.

## Out of scope

AI SDK 7, LangChain/LlamaIndex migration, ambient credential lookup, root
exports and deletion of old adapter-owned model types.

## Acceptance criteria

- Multipart content, structured output, reasoning, tool lifecycle, usage,
  warnings, finish/error and extensions are representable.
- Resolution never reads environment credentials.
- Capability claims cite conformance provenance.
- Builtin model passes focused contract tests.

## Verification

```sh
bun test packages/llm-core/tests/model
bun run typecheck:packages
```

## Work log

- 2026-07-29T16:48:00+08:00 — Claimed for Claude Code by the architecture
  coordinator after core-contracts completed and was integrated at `6e8e6a5`.
- 2026-07-29 — Claude Code moved to `in_progress`. Confirmed the contract freeze
  with the core-contracts owner over the llm-core channel: `#contracts` front exports
  identity / invocation / schema(content) / versioning / capabilities /
  extensions. Two corrections absorbed vs my initial assumptions: `DeploymentRef`
  carries NO `SecretRef` (credentials stay at composition/adapter binding), and
  `InvocationContext` is passed separately to model operations (not embedded in
  `ModelRequest`); resolution policy-constraints are a separate resolver input.
  Building `src/features/model/**` against the frozen contracts.
- 2026-07-29 — Implementation complete; moved to `review` (commit cd37c52).
- 2026-07-29 — Coordinator review round 1: resolved three
  review-priority-1 and two review-priority-2 findings.
  (1) Resolver now honors `CapabilityRequirement.constraints` and fails closed
  for unproven required constraints, with an optional caller-supplied
  `ConstraintEvaluator`; (2) resolver rejects a binding whose
  model/provider/deployment do not exactly match its profile before trusting its
  claims; (3) `ModelProfile` is now `readonly` and the builtin profile is
  deep-frozen (profile/claims/evidence). P2s: builtin claim now carries
  `providerId`/`providerVersion`; unsupported `versionRange` syntax is reported
  explicitly (`unsupported-version-range`) instead of being silently treated as
  exact. Re-verified green.

- 2026-07-29 — Coordinator re-review round 2: resolved 3 remaining P1s (commit
  62cbe51). (1) Added `registerModelProfile`/`RegisteredModelProfile`: validates,
  defensively deep-clones and deep-freezes any profile incl. nested
  claims/evidence; `ModelBinding.profile` now requires a registered profile.
  (2) Constraint and policy evaluation moved from per-request input to trusted
  `createModelResolver` dependencies; evaluators receive frozen minimal
  snapshots, must return exactly `true`, and any throw/non-boolean is a
  fail-closed `evaluator-error`. (3) Added composition-owned routing policy —
  allowed model/provider/deployment/binding lists plus an optional trusted policy
  evaluator, applied before selection/ambiguity. Re-verified green (33 model
  tests, 1087 full).

- 2026-07-29 — Coordinator re-review round 3: resolved the final trust-boundary
  Review priority 1. `registerModelProfile` now clones first, then fully
  validates the clone
  before branding/freezing (getter-divergence safe; non-cloneable sources
  rejected). New `profile-validation.ts` deep-validates every CapabilityClaim
  branch and its ConformanceEvidence variant, EvidenceRef/ResourceRef/Digest,
  reverse-DNS capabilityId, provenance, date-time, optional schema, and
  extensions (strict JSON + reverse-DNS) using the contracts' own guards
  (`isSchemaRef`/`isNativeExtensions`/`isJsonValue`/`isContractVersion`/
  `isDigest`/`isCanonicalUuid`/`isExternalId`). Added rejection tests for empty
  evidence, non-namespaced capabilityId, and non-JSON / invalid-namespace
  extensions. `architecture_version: 2` preserved. Re-verified green (37 model
  tests, 1091 full).
- 2026-07-29T19:14:00+08:00 — Final closed-object amendment integrated through
  `6b9838c`; coordinator verification passed (39 model tests, package typecheck,
  contract schema check and focused lint). Task marked complete.

- 2026-07-29 — Coordinator re-review round 4: resolved the closed-object
  review-priority-1 finding.
  Profile validation now rejects undeclared keys (ADR-003 closed objects) at the
  profile, every claim variant, every evidence variant/base, `EvidenceRef`,
  `ResourceRef`, and constraints; only the declared `extensions` maps stay open
  (strict JSON + reverse-DNS). A stray root `credential` or a physical evidence
  locator (`signedUrl`) is now rejected. Added rejection tests for both. Digest
  and SchemaRef are already closed via the contracts' guards. Re-verified green
  (39 model tests, 1093 full).

## Handoff

Status: ready for coordinator review (rounds 1–4 findings resolved).

### Files added (write scope only)

`src/features/model/`:

- `references.ts` — `ModelRef`/`ProviderRef`/`DeploymentRef`/`ModelProfileId`
  branded on the contracts' `OpaqueId`; constructors validate printable-ASCII
  ids. `DeploymentRef` carries no credential.
- `content.ts` — `ModelContentPart` closed union reusing contracts'
  `PortableContent` plus `ReasoningPart`/`ToolCallPart`/`ToolResultPart`;
  `ModelMessage`/`ModelRole`.
- `request.ts` — `ModelRequest`, `ToolDeclaration`, `ToolChoice`,
  `ResponseFormat` (text | json+`SchemaRef`), `SamplingParams`,
  `ProviderRequestMetadata` (redacted `NativeExtensions`).
- `response.ts` — `ModelResponse` = `ModelCompletion | ModelErrorResponse`;
  `FinishReason`, `ModelUsage`, `ModelWarning`, `ModelError`,
  `ProviderResponseMetadata`.
- `profile.ts` — `ModelProfile` (versioned; `claims: CapabilityClaim[]` from
  contracts, evidence-backed).
- `resolver.ts` — `ModelResolver` port + `createModelResolver()`: deterministic,
  exact-over-alias precedence, capability filtering, explicit
  ambiguous/no-eligible/unknown-selection failures, named-default recorded via
  `matchedBy`. No environment reads.
- `model.ts` — `Model` port (`generate`/optional `stream`) taking
  `InvocationContext` as a separate argument; `ModelStreamEvent` projection.
- `builtin.ts` — `createBuiltinModel`/`createBuiltinModelProfile`: deterministic
  echo model, first executable path, self-declared conformance evidence
  placeholder.
- `public.ts` — single feature front (ADR-001); no deep imports leak.

`tests/model/`: `contracts.test.ts`, `builtin.test.ts`, `resolver.test.ts`,
`profile.test.ts` (18 tests).

### Verification (from packages/llm-core)

- `bun test tests/model` → 25 pass, 0 fail, 62 expect().
- `bun test` (full package) → 1079 pass, 35 skip, 0 fail.
- `bun run typecheck` (`tsc --noEmit`) → exit 0.
- `bunx eslint src/features/model tests/model` → exit 0.
- `git status` limited to `src/features/model/**`, `tests/model/**`, this task
  file.

### ADRs applied

ADR-001 (feature front, contracts-only inward deps), ADR-002 (vocabulary),
ADR-003 (content union, identity, schema/versioning reuse), ADR-004 (model refs,
deterministic resolution, credential boundary).

### Deviations / known limits

- `ToolDeclaration.parameters` is a `JsonValue` (JSON-Schema-shaped) placeholder;
  the tooling feature will own richer declarations at convergence (tooling
  public front does not exist yet at this base).
- Resolver `versionRange` supports absent/`*`/exact-match only; richer SemVer
  range semantics deferred (no generic helper is frozen in core-contracts).
- Builtin capability claim uses self-declared placeholder conformance evidence;
  real suites belong to the conformance task.
- Correction to an earlier channel message: the transient ajv typecheck error I
  reported against the base was a `node_modules` dedup artifact, not a core-contracts
  defect. After dependency resolution settled, `tsc --noEmit` is clean across the
  whole package. No base fix is required.

### Not done (out of scope)

Root exports / package `exports` wiring (integration owner, core-convergence); AI SDK /
LangChain / LlamaIndex migration; deletion of legacy
`adapters/types/model.ts` and `model-selection.ts`.

### Shared-file requests for the integration owner

At convergence, add the `@geekist/llm-core/model` subpath export, then delete
the legacy adapter-owned model types and `model-selection.ts`. The final v2
package intentionally does not retain a private model compatibility alias.
