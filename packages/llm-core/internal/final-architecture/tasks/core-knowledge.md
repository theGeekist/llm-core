---
architecture_version: 2
id: core-knowledge
legacy_id: P0-141
title: Implement knowledge retrieval and indexing fronts
stage: core
status: done
priority: critical
preferred_owner_kind: codex
owner: codex-root
owner_kind: codex
lease_started_at: 2026-07-29T23:05:00+08:00
lease_expires_at: null
base_sha: ab397fc
branch: task/P0-141-codex
worktree: /Users/jasonnathan/Repos/@theGeekist/llm-core/.worktrees/P0-141-codex
depends_on:
  - core-contracts
  - core-model-runtime
  - core-ai-sdk-adapter
decision_dependencies:
  - ADR-001
  - ADR-002
  - ADR-003
  - ADR-004
  - ADR-007
  - ADR-008
conflicts_with: []
write_scope:
  - packages/llm-core/src/features/retrieval/**
  - packages/llm-core/src/features/indexing/**
  - packages/llm-core/src/adapters/providers/ai-sdk/retrieval/**
  - packages/llm-core/src/adapters/frameworks/langchain/retrieval/**
  - packages/llm-core/src/adapters/frameworks/llamaindex/retrieval/**
  - packages/llm-core/tests/retrieval/**
  - packages/llm-core/tests/indexing/**
  - packages/llm-core/internal/final-architecture/tasks/core-knowledge.md
review_owner: coordinator
updated_at: 2026-07-29
---

# core-knowledge — Knowledge Retrieval and Indexing

## Objective

Replace adapter-owned document, retrieval, embedding, query and indexing
contracts with neutral feature fronts while preserving current parity evidence.

## Acceptance criteria

- Retrieval owns document loading, splitting, embedding, retrieval, reranking,
  structured query, query engine and response synthesis ports.
- Indexing owns indexing and vector-store ports.
- Portable data uses closed content, `ResourceRef`, `SchemaRef` and `JsonValue`;
  executable/native values remain live adapter inputs.
- `InvocationContext` stays separate and `MaybePromise`/stream behavior survives.
- New qualified adapters depend only on feature public fronts.

## Verification

```sh
bun test packages/llm-core/tests/retrieval packages/llm-core/tests/indexing
bun run typecheck:packages
```

## Work log

- 2026-07-29T23:05:00+08:00 — Claimed for Codex subagent execution.
- 2026-07-29T23:28:00+08:00 — Added sibling retrieval and indexing
  feature fronts, plus qualified AI SDK, LangChain and LlamaIndex adapters.
- 2026-07-29T23:28:00+08:00 — Verified 12 focused tests, package and test
  typechecks, deterministic contract schema, scoped lint and diff hygiene;
  moved to review.
- 2026-07-29T23:38:00+08:00 — Expanded the qualified-adapter parity matrix
  across every migrated adapter family, including sync/async behavior,
  cardinality/order, stream order, delete tri-state and redaction.
- 2026-07-29T23:55:00+08:00 — Coordinator review made text-only projections
  fail closed on semantic loss, rejected unsupported structured filters, and
  redacted native streaming failures.
- 2026-07-29T23:58:00+08:00 — Independently approved at
  `109b5d0286e41f08ff5f37eed109d5fb95c1e450`; integrated to `main`, passed
  receiving verification, and marked complete by the coordinator.
- 2026-07-30T00:08:00+08:00 — Independent-review follow-up removed native raw
  projection, rejected unsupported LlamaIndex namespaces and multimodal
  responses, and blocked empty LangChain filters before side effects.

## Handoff

- Architecture: the backend slice rules keep retrieval and indexing as sibling
  capabilities with one `public.ts` each. Cross-capability dependency is only
  indexing to retrieval's public `Document`; framework/provider conversions
  remain qualified edge adapters.
- Portable contracts: documents use the closed `PortableContent` union with
  optional `ResourceRef`, `SchemaRef` and JSON metadata. Native handles,
  physical locators and adapter metadata are absent. `InvocationContext` is a
  distinct operation argument, and `MaybePromise`/`MaybeAsyncIterable`
  behavior remains explicit.
- Parity: document loading/transformation, splitting, embedding, retrieval,
  reranking, structured query, query engine and response synthesis ports are
  represented. Indexing and document/vector upsert plus id/filter deletion are
  represented. Qualified adapters cover the existing AI SDK, LangChain and
  LlamaIndex knowledge families without importing legacy adapter contracts.
- Focused verification:
  `bun test packages/llm-core/tests/retrieval packages/llm-core/tests/indexing`
  — 25 pass, 0 fail, 91 assertions.
- Static verification: `bun run typecheck:packages`,
  `bun run --cwd packages/llm-core typecheck:tests`,
  `bun run contracts:schema:check`, scoped ESLint and `git diff --check` all
  exit 0.
- Compatibility decisions for convergence: indexing now receives resolved
  documents; application orchestration must call a `DocumentLoader` first
  instead of embedding a live loader in `IndexingRequest`. Native LlamaIndex
  raw response values are never projected. Its text-only query/synthesis
  adapter rejects multimodal responses, namespaces fail closed because the
  native port cannot guarantee isolation, and filter deletion remains
  unsupported with `null`.
