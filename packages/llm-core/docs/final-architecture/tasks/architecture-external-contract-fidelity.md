---
id: architecture-external-contract-fidelity
title: Enforce exact external contract fidelity
stage: architecture
status: done
priority: critical
depends_on:
  - architecture-runtime-ownership-correction
decision_dependencies:
  - ADR-017
conflicts_with: []
write_scope:
  - docs/index.md
  - docs/adapters/index.md
  - docs/orchestration/index.md
  - packages/llm-core/docs/final-architecture/**
required_reading:
  - path: packages/llm-core/docs/final-architecture/EXTERNAL-CONTRACT-FIDELITY-IMPACT.md
    reason: "Use the code and task inventory that scopes the exact-contract correction."
  - path: packages/aifsd/docs/final-architecture/LLM-CORE-PARITY.md
    reason: "Preserve the reviewed cross-authority dispositions and llm-core provenance."
  - path: context/simple-chat/README.md
    reason: "Keep the downstream repository's scaffold-only status distinct from executable protocol evidence."
  - path: context/simple-chat/docs/architecture/authority-map.md
    reason: "Interpret its current working-tree decisions and specifications through their stated document roles."
  - path: context/simple-chat/docs/adr/0001-a2a-canonical-protocol.md
    reason: "Use a real product's A2A decision as design pressure while grounding qualification in the official recognised protocol."
read_scope:
  - packages/llm-core/docs/final-architecture/EXTERNAL-CONTRACT-FIDELITY-IMPACT.md
  - packages/aifsd/docs/final-architecture/LLM-CORE-PARITY.md
  - context/simple-chat/README.md
  - context/simple-chat/docs/architecture/authority-map.md
  - context/simple-chat/docs/adr/0001-a2a-canonical-protocol.md
  - packages/llm-core/**
  - packages/aifsd/**
  - context/aifsd-research/product/aifsd/docs/**
review_owner: human
updated_at: 2026-08-07
---

# architecture-external-contract-fidelity — Enforce exact external contract fidelity

## Objective

Replace support-by-loss contracts with exact recognised external contracts,
native preservation and explicit `supported`, `unsupported` or
`not-applicable` operation dispositions.

## In scope

- Inventory every public type, task, adapter and fixture using conversion loss,
  projected support or omitted provider-native semantics.
- Pin each integration to its recognised specification or reference
  implementation and exact version in the correction contract. For an
  unselected future integration, record the claim-time authority and pinning
  gate instead of inventing a premature version.
- Define the exact-operation vocabulary, the closed `supported`, `unsupported`
  and `not-applicable` matrix, and fixture obligations inherited by
  implementation tasks.
- Record provider, protocol, runtime and specification implementation impact
  and allocate non-overlapping correction tasks.
- Correct proposed downstream task contracts before implementation begins.
- Replace generic public architecture guidance that recommends semantic-loss
  reporting with the accepted exact-operation policy.

## Out of scope

- Adding unsupported external operations merely to increase coverage.
- Moving native framework or protocol contracts into the portable kernel.
- Compatibility aliases for removed fidelity or loss-report contracts.
- Implementing the adapter, package-export, conformance-fixture and
  integration-specific documentation corrections owned by its follow-up
  tasks.

## Acceptance criteria

- ADR-017's accepted architecture defines exact supported, unsupported and
  not-applicable operations without treating semantic loss as support.
- `not-applicable` requires exact source-contract evidence that the operation
  or semantic dimension is absent; it cannot conceal an unimplemented or
  unqualified applicable operation.
- The correction contract defines source-contract identity, versioning,
  native-ownership, security-boundary and executable-fixture obligations.
- `EXTERNAL-CONTRACT-FIDELITY-IMPACT.md` names every directly affected public
  contract, implementation family, public adoption page and positive
  fail-closed control.
- Its integration matrix names each operation family, recognised authority,
  exact current version or explicit claim-time deferral, native surface and
  executable fixture owner.
- Every affected implementation and public document has one explicit future
  writer, a non-overlapping write scope and concrete verification.
- Proposed runtime, protocol and specification tasks inherit the exact
  operation contract before implementation begins.
- `PLAN.md` and `LANGUAGE.md` no longer recommend loss accounting as an
  interoperability contract; integration-specific pages remain owned by their
  downstream correction tasks until those implementations change.

## Verification

```sh
bun run docs:check
bun run docs:build
bun test scripts/check-docs.test.ts scripts/check-sloc.test.ts
git diff --check
```

## Work log

2026-08-07: Completed the first code-impact inventory. It found two published
subpaths, the shared specification contract, five specification adapter
families, the AI SDK provider adapter and the existing PydanticAI runtime proof
directly affected. Fourteen proposed task contracts were corrected. No A2A or
MCP production implementation exists yet.

2026-08-07: Review separated this architecture freeze from the downstream code
outcomes. Public adoption pages were inventoried and assigned to exactly one
correction task with concrete verification so the parent can complete before
its implementation dependants start.

2026-08-07: Human review accepted ADR-017. Simple Chat remains independent
mutable product context that informed the A2A requirement; the official A2A
contract remains the qualification authority. The architecture freeze is
complete and the three implementation correction tasks remain proposed.

## Blocker

None.

## Handoff

See `EXTERNAL-CONTRACT-FIDELITY-IMPACT.md`. This task freezes the architecture,
ownership map and generic guidance under accepted ADR-017. Implementation is
split across three correction tasks plus corrected future protocol/runtime
tasks; none of their code outcomes is a completion condition for this task.
