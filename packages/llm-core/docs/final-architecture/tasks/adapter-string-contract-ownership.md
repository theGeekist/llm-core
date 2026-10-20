---
id: adapter-string-contract-ownership
title: Give reviewed adapter strings meaningful typed ownership
stage: adapters
status: review
priority: high
depends_on:
  - architecture-adapter-sloc-decomposition
decision_dependencies:
  - ADR-003
  - ADR-007
  - ADR-017
  - ADR-018
conflicts_with: []
write_scope:
  - packages/llm-core/src/adapters/openspec/public.ts
  - packages/llm-core/src/adapters/openspec/status-contract.ts
  - packages/llm-core/src/adapters/pydantic-ai-spec/compiler.ts
  - packages/llm-core/src/adapters/pydantic-ai-spec/semantic-review.ts
  - packages/llm-core/src/adapters/pydantic-ai-spec/native-contract.ts
  - packages/llm-core/src/adapters/spec-kit/public.ts
  - packages/llm-core/src/adapters/spec-kit/support.ts
  - packages/llm-core/src/adapters/spec-kit/file-types.ts
  - packages/llm-core/src/adapters/spec-kit/file-resolution.ts
  - packages/llm-core/src/adapters/spec-kit/file-identity.ts
  - packages/llm-core/src/adapters/claude-native-session/runner.ts
  - packages/llm-core/src/adapters/claude-native-session/profile.ts
  - packages/llm-core/src/adapters/claude-native-session/stream-contract.ts
  - packages/llm-core/src/adapters/antigravity-desktop-sidecar/probe.ts
  - packages/llm-core/src/adapters/antigravity-desktop-sidecar/profile.ts
  - packages/llm-core/src/adapters/antigravity-desktop-sidecar/probe-contract.ts
  - packages/llm-core/tests/adapters/spec-kit/contract-ownership.test.ts
  - packages/llm-core/tests/adapters/openspec/public.test.ts
  - packages/llm-core/docs/internal/PR-10-REVIEW.md
  - packages/llm-core/docs/final-architecture/tasks/adapter-string-contract-ownership.md
  - packages/llm-core/docs/final-architecture/STATUS.md
required_reading:
  - path: packages/llm-core/docs/internal/PR-10-REVIEW.md
    reason: Apply all three user comments and preserve the explicit approval boundary.
  - path: packages/llm-core/src/adapters/protocols/a2a/support.ts
    reason: Reuse typed authority, operation, contract and fixture catalogue conventions.
  - path: packages/llm-core/src/adapters/ai-sdk/native-contract.ts
    reason: Retain adapter-owned exact authority and typed native operation semantics.
  - path: packages/llm-core/src/contracts/identity.ts
    reason: Preserve branded portable IDs without converting source-owned identities into UUIDs.
  - path: packages/llm-core/src/contracts/versioning.ts
    reason: Reuse validated versions and digest constructors.
read_scope:
  - packages/llm-core/docs/internal/PR-10-REVIEW.md
  - packages/llm-core/src/adapters/protocols/a2a/support.ts
  - packages/llm-core/src/adapters/ai-sdk/native-contract.ts
  - packages/llm-core/src/contracts/identity.ts
  - packages/llm-core/src/contracts/versioning.ts
  - AGENTS.md
  - README.md
  - packages/llm-core/README.md
  - packages/llm-core/docs/**
  - packages/llm-core/src/**
  - packages/llm-core/tests/**
  - scripts/check-sloc.ts
  - scripts/quality/**
  - package.json
review_owner: coordinator
updated_at: 2026-10-20
---

# adapter-string-contract-ownership

## Objective

Address the three substantive PR #10 review comments across the source changed
by that pull request. Make exact native contracts, provenance, fixtures,
deterministic identities and diagnostic meaning discoverable through typed,
adapter-owned definitions used by behavior.

## Scope and limits

At most sixteen production files and five task/evidence/test files are writable.
Use the twelve existing source files and four named new modules above. Adjacent
Claude and Sidecar profiles may wire their existing identities into shared typed
definitions; their capability declarations must remain unchanged. Audit the
checker seal removal but do not edit checker policy or baselines. Add meaningful
malformed-JSON regressions for the reviewed kind/tier, source role/authority and
OpenSpec artifact-status coercion gaps.
Preserve public APIs, exact serialized values, error behavior, unknown native
failures and source-versus-published-package distinctions. Do not create a
repository-wide string framework or merely hoist arbitrary constants.

## Acceptance and integration

- Each reviewed machine value has a meaningful contract, typed catalogue or
  identity/diagnostic builder owner; intentionally retained literals are listed
  with their existing authority.
- Existing independent fixtures and wire expectations pass without importing the
  new definitions as both expected and actual values.
- Focused tests, package types, lint, SLOC and package qualification pass.
- Independent review covers the exact final diff and all three user requests.
- Keep the separate follow-up PR ready for review; never create a draft PR.
  Do not merge, resolve user threads or claim user acceptance without explicit
  user approval.

## Work log

2026-10-20: Read all three user comments and existing identity, contract,
profile and typed operation catalogue conventions before implementation.
Implemented the bounded ownership correction. Independent technical review
found no remaining actionable source findings after correcting widened
catalogues, ambiguous binding names and a malformed SpecKit string-coercion
boundary. Independent focused verification passed 87 tests with two existing
external-runtime skips. Production and test typechecks, focused lint and SLOC
pass. Combined root quality passed with 1,520 tests and seven existing skips,
87.27% line coverage and 91.44% function coverage. Package release qualification
passed with 904 tests and four existing external-runtime skips. The isolated
packed consumer verified all 35 ESM-only exports. User acceptance is not inferred
from these technical checks.

2026-10-20 follow-up: Verified all three CodeRabbit observations against the
published PR head. Added actual-string checks and malformed-input regressions for
OpenSpec status and SpecKit source role/authority. Reused workflow scope builders
and the established UTF-16 comparator. The functional-style review is explicitly
nonblocking; wider runtime sequencing changes are deferred. Independent review of
the seven-file follow-up found no actionable issues. Focused adapter tests passed
40 tests with one existing external-runtime skip; production and test types,
formatting and SLOC passed. Package `release:build` passed with 908 tests and four
existing external-runtime skips, schema/status validation, lint (zero errors),
types and declaration/ESM builds.

Execution mode: dedicated-worktree
Execution checkout: `/workspace/scratch/80516c47232a/llm-core-pr12`.
Execution rationale: Preserve the prior dirty checkout and qualify an isolated
copy of the authoritative published PR head `5e36ad0f`.
Concurrency evaluation: no concurrent writes; the follow-up changes no Sidecar
files and therefore avoids the active Sidecar review scope.

## Handoff

Source correction, independent technical review and local combined qualification
are complete for the initial PR head. PR #12 is open and ready for review. Its
initial remote checks passed; follow-up edits require fresh checks. Explicit user
merge approval remains pending. Do not merge or resolve the original user threads.
