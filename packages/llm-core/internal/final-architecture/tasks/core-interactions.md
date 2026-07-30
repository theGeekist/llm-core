---
architecture_version: 2
id: core-interactions
legacy_id: P0-170
title: Convert interaction sessions and UI projections
stage: core
status: done
priority: critical
preferred_owner_kind: codex
owner: codex-root
owner_kind: codex
lease_started_at: 2026-07-29T22:55:00+08:00
lease_expires_at: null
base_sha: 104e8a8
branch: task/P0-170-codex
worktree: /Users/jasonnathan/Repos/@theGeekist/llm-core/.worktrees/P0-170-codex
depends_on:
  - core-state-interventions
  - core-agent-runner
  - core-ai-sdk-adapter
decision_dependencies:
  - ADR-002
  - ADR-005
  - ADR-006
conflicts_with: []
write_scope:
  - packages/llm-core/src/application/interaction/**
  - packages/llm-core/src/adapters/ui/**
  - packages/llm-core/tests/application/interaction/**
  - packages/llm-core/tests/adapters/ui/**
  - packages/llm-core/internal/final-architecture/tasks/core-interactions.md
review_owner: coordinator
updated_at: 2026-07-29
---

# core-interactions — Convert Interaction Sessions and UI Projections

## Objective

Move conversation/session orchestration and UI event projections onto the new
runner, event and state contracts.

## In scope

Conversation identity, session persistence, live continuation handling,
interaction reducer/projection, assistant-ui, ChatKit and NLUX projections, and
the architectural projection layer above the AI SDK UI compatibility baseline
established by core-ai-sdk-adapter.

## Out of scope

Durable job scheduling, AI SDK dependency/provider compatibility, package
exports and legacy-directory deletion.

## Acceptance criteria

- Session state never claims durable continuation.
- UI events are projections of canonical execution events.
- Reconnect semantics remain distinct from workflow durability.
- Existing UI behavior is retained by migrated tests.

## Verification

```sh
bun test packages/llm-core/tests/application/interaction packages/llm-core/tests/adapters/ui
bun run typecheck:packages
```

## Work log

- 2026-07-29T22:55:00+08:00 — Claimed by the Codex coordinator after core-state-interventions,
  core-agent-runner and core-ai-sdk-adapter integrated and passed receiving verification.
- 2026-07-29 — Implementation started in the assigned isolated worktree.
- 2026-07-29 — Implemented pre-run revision reservation, closed portable
  snapshot registration, process-local reconnect, canonical redacted content
  events, monotonic terminal projections and installed-framework UI adapters.
- 2026-07-29 — Addressed adversarial review findings covering competing
  sessions, nested snapshot injection, run identity, terminal agreement and
  native AI SDK UI, assistant-ui, ChatKit and NLUX behavior.
- 2026-07-29 — Closed the remaining review boundaries for provider-session
  reconstruction, release cleanup, safe reason codes, registered content,
  reconstructable projection indexes, event-ID collisions, message/tool
  ordering and open-message terminal delivery.
- 2026-07-29 — Reused live leaf validators at snapshot load for safe codes,
  canonical identities/timestamps, closed intervention decisions and
  credential-free projected JSON.
- 2026-07-29 — Moved to `review` after focused and legacy retention suites,
  package/test typechecks, schema freshness, focused lint and diff checks
  passed.
- 2026-07-29 — Independently approved at
  `19aed56d47f38a36cdf1274f00b9486db3bdc221`; integrated to `main` with
  receiving verification and marked complete by the coordinator.

## Handoff

- Review candidate: task branch HEAD; the exact SHA is reported to the
  coordinator after this handoff is committed.
- Worktree: clean at the reported review SHA.
- Changed files are confined to this task's declared write scope:
  - `packages/llm-core/src/application/interaction/**`
  - `packages/llm-core/src/adapters/ui/**`
  - `packages/llm-core/tests/application/interaction/**`
  - `packages/llm-core/tests/adapters/ui/**`
  - this task file
- Verification:
  - `bun test packages/llm-core/tests/application/interaction packages/llm-core/tests/adapters/ui`
    — exit 0; 23 passed, 0 failed.
  - Legacy session/reducer and AI SDK UI/assistant-ui/ChatKit/NLUX retention
    suite — exit 0; 72 passed, 0 failed.
  - `bun run typecheck:packages` — exit 0; package typecheck and generated
    schema freshness passed.
  - `bun run --cwd packages/llm-core typecheck:tests` — exit 0.
  - Focused ESLint over task source/tests — exit 0.
  - `git diff --check` — exit 0.
- ADRs applied: ADR-002, ADR-005 and ADR-006; no deviations.
- Review posture:
  - conversation revision ownership is atomically reserved before runner start;
  - loaded snapshots are closed, reconstructed, cloned and frozen;
  - live reconnect remains a non-serializable `LiveContinuation`;
  - provider continuity remains an opaque `ProviderSessionRef`;
  - UI text/tool content crosses only through explicit redacted projection
    facts, while evidence events remain argument/result free;
  - per-source sequences increase monotonically and terminal runs cannot
    reopen; runner event/result identity and terminal status must agree; and
  - native adapter types are confined to `adapters/ui`.
- Remaining risks: the storage-neutral session store requires a conforming
  implementation whose reservation is atomic and exclusive. core-convergence must wire
  provider/UI compatibility streams into canonical interaction content events;
  this task deliberately does not edit the core-ai-sdk-adapter-owned adapter.
- Shared-file requests for core-convergence:
  - repoint `packages/llm-core/src/interaction/index.ts` and the
    `./interaction` export to
    `packages/llm-core/src/application/interaction/public.ts`;
  - expose the new mappers from the existing qualified
    `./adapters/ai-sdk-ui`, `./adapters/assistant-ui`,
    `./adapters/openai-chatkit` and `./adapters/nlux-ui` fronts; and
  - retain those qualified subpaths rather than adding a broad
    `./adapters/ui` public export.
