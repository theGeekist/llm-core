---
architecture_version: 2
id: architecture-adapter-sloc-decomposition
title: Decompose legacy adapter modules above the hard SLOC boundary
stage: architecture
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
  - architecture-source-layout-normalization
decision_dependencies:
  - ADR-007
  - ADR-015
conflicts_with:
  - adapter-openspec-release
  - adapter-pydantic-ai-release
  - adapter-spec-kit-release
write_scope:
  - packages/llm-core/src/adapters/openspec/**
  - packages/llm-core/src/adapters/pydantic-ai-spec/**
  - packages/llm-core/src/adapters/spec-kit/**
  - scripts/sloc-baseline.json
  - packages/llm-core/docs/final-architecture/tasks/architecture-adapter-sloc-decomposition.md
required_reading:
  - path: scripts/sloc-baseline.json
    reason: "Use the recorded waiver digests and ceilings as decomposition evidence."
read_scope:
  - scripts/sloc-baseline.json
  - packages/llm-core/src/adapters/openspec/**
  - packages/llm-core/src/adapters/pydantic-ai-spec/**
  - packages/llm-core/src/adapters/spec-kit/**
review_owner: coordinator
updated_at: 2026-08-09
---

# architecture-adapter-sloc-decomposition — Decompose legacy adapter modules

## Objective

Split the OpenSpec, PydanticAI specification and Spec Kit adapter modules whose
committed content exceeds the 600-line hard boundary, without changing their
qualified external contracts.

## In scope

- Decompose each waived source module into cohesive adapter-owned files.
- Preserve every exact operation, validator, fixture and published behaviour.
- Remove the three temporary hard-boundary waivers after decomposition.

## Out of scope

- Changing upstream authority, qualified versions or package exports.
- Combining the three independent adapter contracts.

## Acceptance criteria

- Every affected hand-written production module is at or below 600 physical
  lines, with the approximately-500 policy applied normally.
- Existing adapter, conformance, package and documentation suites pass.
- The three temporary hard-boundary waivers are removed.

## Verification

```sh
bun run check:sloc
bun run --cwd packages/llm-core release:build
bun run test:package
git diff --check
```

## Work log

Not started; planned from the pre-existing drift exposed by
`adapters-protocol-qualification` release verification.

## Handoff

Pending execution. Record the new module boundaries, removed waiver entries
and unchanged operation evidence before review.
