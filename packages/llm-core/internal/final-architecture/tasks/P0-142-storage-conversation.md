---
architecture_version: 2
id: P0-142
title: Implement storage and conversation fronts
phase: P0.3
status: complete
priority: P0
preferred_owner_kind: codex
owner: codex-root
owner_kind: codex
lease_started_at: 2026-07-29T23:05:00+08:00
lease_expires_at: null
base_sha: e80b33ec370f18c7dfef94c33da71fa63ef631bc
branch: task/P0-142-codex
worktree: /Users/jasonnathan/Repos/@theGeekist/llm-core/.worktrees/P0-142-codex
depends_on:
  - P0-100
  - P0-120
  - P0-130
  - P0-160
decision_dependencies:
  - ADR-001
  - ADR-002
  - ADR-003
  - ADR-006
  - ADR-007
  - ADR-008
conflicts_with: []
write_scope:
  - packages/llm-core/src/features/storage/**
  - packages/llm-core/src/features/memory/**
  - packages/llm-core/src/adapters/providers/ai-sdk/storage/**
  - packages/llm-core/src/adapters/frameworks/langchain/storage/**
  - packages/llm-core/src/adapters/frameworks/llamaindex/storage/**
  - packages/llm-core/tests/storage/**
  - packages/llm-core/tests/memory/**
  - packages/llm-core/internal/final-architecture/tasks/P0-142-storage-conversation.md
review_owner: coordinator
updated_at: 2026-07-29
---

# P0-142 — Storage and Conversation

## Objective

Replace adapter-owned storage, cache, memory and thread contracts with neutral
live ports and portable conversation records.

## Acceptance criteria

- Storage owns resource, key-value and cache live ports.
- Memory owns `ConversationStore`, `ConversationRecord` and
  `ConversationTurn`, using canonical conversation identity and model content.
- Portable records contain no bytes, paths, signed URLs, raw credentials or
  unconstrained values.
- `Uint8Array` access is explicitly live and `MaybePromise` is preserved.
- New qualified adapters depend only on feature public fronts.

## Verification

```sh
bun test packages/llm-core/tests/storage packages/llm-core/tests/memory
bun run typecheck:packages
```

## Work log

- 2026-07-29T23:05:00+08:00 — Claimed for Codex subagent execution.
- 2026-07-30 — Independently approved at
  `01c35bc27047c76d0b0c438b1bf0a3d0be34a15b`; integrated to `main`, passed
  receiving verification, and marked complete by the coordinator.
- 2026-07-29T23:18:00+08:00 — Implementation started from coordinator-provided
  base `e80b33e`; legacy storage and memory contracts/tests remain read-only
  parity evidence.
- 2026-07-29T23:45:00+08:00 — Implementation and verification completed; task
  moved to review for coordinator integration.
- 2026-07-30T00:14:00+08:00 — Closed independent-review findings at
  `61671e3ba0e88403174e838420d6ef3ad943bfad`: installed LlamaIndex stores now
  have concrete conformance, portable JSON is recursively guarded, cache TTL
  and aliasing semantics fail closed, false AI SDK claims were removed and
  multipart projection is atomic.
- 2026-07-30T00:35:00+08:00 — Closed the second independent-review findings:
  normalized sensitive-key variants now fail closed at every portable JSON
  boundary while exact opaque references remain supported, and runtime cache
  TTL resolution preserves invalid values for validation before encoding or
  backend writes.
- 2026-07-30T00:55:00+08:00 — Closed the final independent-review findings:
  every denied normalized key stem now fails closed regardless of position, and
  malformed tagged opaque-reference lookalikes can no longer fall back to
  generic JSON at any recursive portable boundary.

## Handoff

- Initial implementation: `36d81d0087fd93cf0f362cac4481e512759150b0`.
- Review-fix implementation:
  `61671e3ba0e88403174e838420d6ef3ad943bfad`.
- Second review-fix implementation:
  `7a13a2cae1d563ce616d1f6c808c9662e4223eee`.
- Final handoff commit: task branch HEAD; exact SHA is reported to the
  coordinator after this handoff commit is created.
- Worktree: clean at the reported commit.
- Changed files:
  - new storage feature front under `packages/llm-core/src/features/storage/`
  - new memory feature front under `packages/llm-core/src/features/memory/`
  - qualified AI SDK, LangChain and LlamaIndex storage/conversation adapters
  - storage and memory contract, policy and adapter tests
  - this task file
- Verification:
  - `bun test packages/llm-core/tests/storage packages/llm-core/tests/memory` —
    exit 0; 28 passed, 0 failed, 184 assertions.
  - `bun test packages/llm-core/tests` — exit 0; 1,246 passed, 35 skipped, 0
    failed.
  - `bun run typecheck:packages` — exit 0; package typecheck and schema
    freshness passed.
  - `bun run typecheck:tests` — exit 0.
  - focused ESLint over the changed source/test directories — exit 0.
  - `git diff --check` — exit 0.
- ADRs applied: ADR-001, ADR-002, ADR-003, ADR-006, ADR-007 and ADR-008; no
  deviations.
- Projection behavior: only native strings or wholly text/reasoning multipart
  arrays become portable turns. Any unsupported turn makes the whole read
  return `null`; best-effort issue callbacks cannot turn failure into a partial
  record or replace the safe outcome when they throw. Provider metadata is
  never copied.
- Portable JSON behavior: normalized authorization, password, secret, cookie,
  client-secret and private-key key variants fail closed recursively regardless
  of stem position, including in conversation JSON and tool arguments/results.
  Exact closed `SecretRef` and `ResourceRef` shapes remain opaque portable
  references; objects tagged with `secretId` or `resourceId` that are malformed,
  have extra fields or use the wrong runtime types are rejected rather than
  treated as generic JSON.
- Cache TTL behavior: explicit, policy-resolved and backend/default TTL values
  distinguish absent `undefined` from invalid `null` or non-integer values.
  Invalid runtime values fail before encoding and backend writes.
- Installed conformance: LlamaIndex uses its public `BaseKVStore`,
  `BaseDocumentStore`, `SimpleKVStore`, `KVDocumentStore`, `Memory` and
  `ChatMessage` contracts. Storage values round-trip through a closed v2
  envelope, and document-store writes use real `Document` nodes.
- Ecosystem naming: installed AI SDK 7 exposes no public cache or conversation
  memory provider contract. The structural adapters in its migration directory
  are therefore named `HostCacheBackend`/`createHostBackedCacheStore` and
  `HostConversationProvider`/`createHostConversationStores`; they make no AI
  SDK conformance claim.
- Remaining risks: live resource bytes still require a host-provided
  `ResourceStore`. The host-backed structural adapters remain physically in the
  AI SDK migration directory until P0-150 selects final adapter placement and
  exports.
- Shared-file requests:
  - P0-149 should bind the new storage and memory public fronts.
  - P0-150 should export the selected public fronts and remove legacy
    adapter-owned storage/memory contracts only after call sites have migrated.
