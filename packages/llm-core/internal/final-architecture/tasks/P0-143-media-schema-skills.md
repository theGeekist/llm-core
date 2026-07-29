---
architecture_version: 2
id: P0-143
title: Implement media, schema resolution and skill fronts
phase: P0.3
status: review
priority: P0
preferred_owner_kind: codex
owner: codex-root
owner_kind: codex
lease_started_at: 2026-07-29T23:56:00+08:00
lease_expires_at: 2026-07-30T23:56:00+08:00
base_sha: 16290df
branch: task/P0-143-codex
worktree: /Users/jasonnathan/Repos/@theGeekist/llm-core/.worktrees/P0-143-codex
depends_on:
  - P0-100
  - P0-120
  - P0-140
  - P0-160
decision_dependencies:
  - ADR-001
  - ADR-002
  - ADR-003
  - ADR-004
  - ADR-006
  - ADR-007
  - ADR-008
conflicts_with: []
write_scope:
  - packages/llm-core/src/features/media/**
  - packages/llm-core/src/features/model/schema-resolution.ts
  - packages/llm-core/src/features/model/prompting.ts
  - packages/llm-core/src/features/model/public.ts
  - packages/llm-core/src/features/agent/skills.ts
  - packages/llm-core/src/features/agent/types.ts
  - packages/llm-core/src/features/agent/spec.ts
  - packages/llm-core/src/features/agent/public.ts
  - packages/llm-core/src/adapters/providers/ai-sdk/media/**
  - packages/llm-core/src/adapters/frameworks/langchain/model-support/**
  - packages/llm-core/src/adapters/frameworks/llamaindex/model-support/**
  - packages/llm-core/tests/media/**
  - packages/llm-core/tests/model/schema-resolution.test.ts
  - packages/llm-core/tests/agent/skills.test.ts
  - packages/llm-core/internal/final-architecture/tasks/P0-143-media-schema-skills.md
review_owner: coordinator
updated_at: 2026-07-29
---

# P0-143 — Media, Schema Resolution and Skills

## Objective

Replace adapter-owned media, schema/output and skill contracts with neutral
ports and portable identities.

## Acceptance criteria

- Media owns image, speech and transcription request/response ports.
- Binary results use portable content/resource references and native metadata
  is redacted and namespaced.
- Schema documents resolve only through a trusted live port; portable requests
  keep `SchemaRef`.
- Skill identity and digest are portable; filesystem paths remain local inputs.
- Prompt/output parsing returns closed portable content or `JsonValue`.

## Verification

```sh
bun test packages/llm-core/tests/media packages/llm-core/tests/model/schema-resolution.test.ts packages/llm-core/tests/agent/skills.test.ts
bun run typecheck:packages
```

## Work log

- 2026-07-29T23:56:00+08:00 — Claimed by the Codex coordinator after P0-170
  passed adversarial review and receiving verification.
- 2026-07-29 — Implementation started in the assigned isolated worktree after
  reading ADR-001 through ADR-008, coordination rules and legacy parity
  evidence.
- 2026-07-29 — Implemented neutral media ports, trusted live schema
  resolution, closed prompt/output parsing, portable skill identities and
  qualified AI SDK, LangChain and LlamaIndex adapters.
- 2026-07-29 — Added authority propagation and adversarial coverage for
  multipart/binary media, partial native results, credential/URL/path leakage,
  local skill ambiguity and mutation isolation.
- 2026-07-29 — Moved to `review` after focused and parity suites, package/test
  typechecks, schema freshness, scoped lint and diff checks passed.

## Handoff

- Review candidate: task branch HEAD; the exact clean SHA is reported to the
  coordinator after this handoff is committed.
- Changed files are confined to the declared P0-143 write scope.
- Verification:
  - focused media/schema/skills suite — 14 passed, 0 failed, 47 assertions;
  - relevant legacy parity and agent specification suite — 44 passed,
    3 environment-gated integrations skipped, 0 failed;
  - `bun run typecheck:packages` — exit 0, including schema freshness;
  - `bun run --cwd packages/llm-core typecheck:tests` — exit 0;
  - scoped ESLint and `git diff --check` — exit 0.
- ADRs applied: ADR-001 through ADR-008 as applicable; no deviations.
- Security and semantic posture:
  - provider options, headers, abort signals, raw native values, errors and
    physical locators do not enter portable media requests or results;
  - live bytes/resources, schema documents and local skill paths cross only
    explicit authority-aware ports with a separate `InvocationContext`;
  - partial/malformed multimedia and unknown speech formats fail closed;
  - native metadata is reduced to namespaced strict JSON with sensitive keys,
    URLs and paths redacted;
  - schema identity and verified digest must exactly match the requested
    `SchemaRef`;
  - parser results are a closed content/JSON discriminant; and
  - portable skill identity is scope + opaque ID + SHA-256 digest, while local
    paths are validated and stripped before preparation.
- Remaining risks: `MediaOutputProjector`, `MediaResourceResolver` and
  `SchemaDocumentResolver` are trusted host boundaries. Hosts must authorize
  the supplied invocation context and make their digest/integrity claims
  truthfully.
- Shared-file requests:
  - P0-149 should bind the new media/resource/schema/skill ports without
    introducing provider controls into their portable inputs.
  - P0-150 should expose
    `src/adapters/providers/ai-sdk/media/public.ts` through the qualified
    `./adapters/ai-sdk` front. The neutral media contracts are already
    re-exported by the curated model feature front.
