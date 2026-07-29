---
id: A0-001
title: Accept final architecture decisions
phase: A0
status: in_progress
priority: P0
preferred_owner_kind: coordinator
owner: architecture-coordinator
owner_kind: coordinator
lease_started_at: 2026-07-29T15:48:27+08:00
lease_expires_at: 2026-07-30T15:48:27+08:00
base_sha: 556ab843c7ef11fed69161981da41d1342e357c2
branch: main
worktree: /Users/jasonnathan/Repos/@theGeekist/llm-core
depends_on: []
decision_dependencies: []
conflicts_with: []
write_scope:
  - packages/llm-core/internal/final-architecture/PLAN.md
  - packages/llm-core/internal/final-architecture/STATUS.md
  - packages/llm-core/internal/final-architecture/decisions/**
review_owner: human
updated_at: 2026-07-29
---

# A0-001 — Accept Final Architecture Decisions

## Objective

Resolve ADR-001 through ADR-007 so implementation workers inherit one topology,
vocabulary, wire contract, security boundary, lifecycle and packaging posture.

## In scope

- Review every proposed ADR in dependency order.
- Split an ADR if a decision cannot be accepted atomically.
- Record accepted/rejected alternatives and update affected task gates.
- Reconcile the plan and status projection.

## Out of scope

Production code, dependencies, exports and compatibility shims.

## Acceptance criteria

- Every ADR is accepted, rejected, superseded or replaced by smaller ADRs.
- No implementation task relies on an unresolved noun or ownership boundary.
- The plan dependency graph matches task front matter.
- Human approval is recorded for CommonJS posture and first Python runtime.

## Verification

```sh
rg -n "^Status: proposed" packages/llm-core/internal/final-architecture/decisions
```

Success means the command returns no proposed decision files.

## Work log

- 2026-07-29: recorded human direction to allow direct breaking
  replacements, default to ESM, permit an evidence-backed Node baseline
  increase, fail closed for meaningful effects, emit receipts through a
  storage-neutral port, redact sensitive event data, delegate the first Python
  runtime selection to the architecture coordinator, and gate all P1 work on
  P0 convergence.
- Accepted ADR-002 and ADR-007.
- Updated ADR-003 and ADR-005 with confirmed security and evidence constraints.

## Blocker

- ADR-003 still requires the schema generator, ID wire representation, content
  variants, and evidence-reference wire shape.
- ADR-005 still requires the canonical digest/normalization algorithm and
  receipt-port recovery semantics after an effect starts.
- ADR-001, ADR-004, and ADR-006 still require explicit acceptance.

## Handoff
