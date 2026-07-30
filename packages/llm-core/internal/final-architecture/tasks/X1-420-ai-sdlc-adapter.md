---
architecture_version: 2
id: X1-420
title: AI-SDLC JSON resource adapter
phase: X1
status: proposed
priority: P2
preferred_owner_kind: codex
owner:
owner_kind:
lease_started_at:
lease_expires_at:
base_sha:
branch:
worktree:
depends_on:
  - P2-320
decision_dependencies:
  - ADR-005
  - ADR-009
conflicts_with: []
write_scope:
  - packages/llm-core/src/adapters/ai-sdlc/**
  - packages/llm-core/tests/adapters/ai-sdlc/**
  - packages/llm-core/internal/final-architecture/tasks/X1-420-ai-sdlc-adapter.md
read_scope:
  - packages/llm-core/src/specifications/**
  - packages/llm-core/src/features/evidence/**
  - /Users/jasonnathan/Repos/aifsd-agent-framework-research/profiles/ai-sdlc.md
review_owner: coordinator
updated_at: 2026-07-30
---

# X1-420 — AI-SDLC JSON resource adapter

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
- A coordinator handoff requesting conditional publication through X1-425.

## Acceptance criteria

- Imported admission metadata is evidence or source material; it does not mint
  an `AcceptedSpecificationRecord` or `RegisteredAcceptedSpecification`.
- Identity or role claims are not treated as authenticated merely because they
  appear in a JSON resource.
- Unsupported orchestration/product fields remain adapter-native or are
  reported.
- Cross-language fixtures pin the supported serialized contract.
- Shared package metadata and packed-consumer expectations remain untouched;
  X1-425 owns publication.

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
