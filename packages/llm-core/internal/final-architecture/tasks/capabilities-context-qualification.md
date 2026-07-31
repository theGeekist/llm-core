---
architecture_version: 2
id: capabilities-context-qualification
title: Context eligibility and compiler boundary
stage: qualification
status: proposed
priority: high
preferred_owner_kind: codex
owner:
owner_kind:
lease_started_at:
lease_expires_at:
base_sha:
branch:
worktree:
depends_on:
  - language-rollout
decision_dependencies:
  - ADR-001
  - ADR-003
  - ADR-013
conflicts_with: []
write_scope:
  - packages/llm-core/src/features/context/**
  - packages/llm-core/tests/context/**
  - docs/capabilities/context.md
  - packages/llm-core/internal/final-architecture/tasks/capabilities-context-qualification.md
read_scope:
  - packages/llm-core/src/contracts/**
  - packages/llm-core/src/features/artifacts/**
  - packages/llm-core/src/features/evidence/**
  - packages/llm-core/src/features/retrieval/**
review_owner: coordinator
updated_at: 2026-08-01
---

# capabilities-context-qualification — Context eligibility and compiler boundary

## Objective

Add a provider-neutral context compiler that makes authorization, freshness,
risk treatment, budget allocation and selection evidence explicit before
content reaches an agent or model.

## In scope

- `ContextCompiler` and closed eligibility/selection-evidence contracts.
- Source authorization, tenant/purpose applicability, classification/redaction,
  freshness, precedence and prompt-injection-risk dispositions.
- Deterministic selection under byte/token budgets, with immutable evidence for
  inclusions, exclusions and truncation.
- Feature tests for policy denial, stale source, unsafe content, redaction,
  deterministic ordering and caller-mutation isolation.

## Out of scope

- A vector database, retrieval ranking implementation, long-term-memory
  backend, policy service or automatic prompt-injection classifier.
- A common root API or provider-native context payload.

## Acceptance criteria

- A `ContextSelection` alone cannot be represented as an authorization grant.
- An authorized compiler decision preserves source/provenance evidence and
  reports every excluded or degraded entry explicitly.
- A budget overflow is deterministic and never silently drops content.
- Native retrieval/session fields remain behind adapters or validated
  extensions.

## Verification

```sh
bun test packages/llm-core/tests/context
bun run typecheck:packages
bun run typecheck:tests
bun run lint
```

## Work log

Planned from ADR-013; not claimed.

## Handoff

Pending.
