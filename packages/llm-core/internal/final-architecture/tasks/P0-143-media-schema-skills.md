---
architecture_version: 2
id: P0-143
title: Implement media, schema resolution and skill fronts
phase: P0.3
status: proposed
priority: P0
preferred_owner_kind: codex
owner: null
owner_kind: null
lease_started_at: null
lease_expires_at: null
base_sha: null
branch: null
worktree: null
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

## Handoff
