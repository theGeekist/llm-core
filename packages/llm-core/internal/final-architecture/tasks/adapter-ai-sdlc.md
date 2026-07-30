---
architecture_version: 2
id: adapter-ai-sdlc
title: AI-SDLC JSON resource adapter
stage: adapters
status: proposed
priority: normal
preferred_owner_kind: codex
owner:
owner_kind:
lease_started_at:
lease_expires_at:
base_sha:
branch:
worktree:
depends_on:
  - specification-api
decision_dependencies:
  - ADR-005
  - ADR-009
conflicts_with: []
write_scope:
  - packages/llm-core/src/adapters/ai-sdlc/**
  - packages/llm-core/tests/adapters/ai-sdlc/**
  - packages/llm-core/internal/final-architecture/tasks/adapter-ai-sdlc.md
read_scope:
  - packages/llm-core/src/specifications/**
  - packages/llm-core/src/features/evidence/**
  - /Users/jasonnathan/Repos/aifsd-agent-framework-research/profiles/ai-sdlc.md
review_owner: coordinator
updated_at: 2026-07-30
---

# adapter-ai-sdlc — AI-SDLC JSON resource adapter

## Objective

Import the supported AI-SDLC JSON resource model to test structured,
cross-language specification resources, governance decisions and evidence
lineage.

## Deliverables

- Versioned resource detection and support declarations.
- Mapping for requirements, decisions, policies, admission metadata,
  attestations and relationships.
- Explicit trust classification for self-asserted policy or approval data.
- Conversion and source-authority diagnostics.
- A coordinator handoff requesting conditional publication through adapter-ai-sdlc-release.

## Acceptance criteria

- Imported admission metadata is evidence or source material; it does not mint
  a `SpecificationDecisionRecord` or runtime authority token.
- Identity or role claims are not treated as authenticated merely because they
  appear in a JSON resource.
- Unsupported orchestration/product fields remain adapter-native or are
  reported.
- Cross-language fixtures pin the supported serialized contract.
- Shared package metadata and packed-consumer expectations remain untouched;
  adapter-ai-sdlc-release owns publication.

## Verification

```sh
bun test packages/llm-core/tests/adapters/ai-sdlc
bun run typecheck:packages
bun run typecheck:tests
bun run lint
```

## Work log

Not started.

## Handoff

Pending.
