---
architecture_version: 2
id: adapter-ai-sdlc
title: AI-SDLC JSON resource adapter
stage: adapters
status: done
evidence_milestone: cf3347d
priority: normal
preferred_owner_kind: codex
owner: codex-root
owner_kind: coordinator
lease_started_at:
lease_expires_at:
base_sha: 9920425
branch: main
worktree: /Users/jasonnathan/Repos/@theGeekist/llm-core
depends_on:
  - specification-api
decision_dependencies:
  - ADR-005
  - ADR-009
conflicts_with: []
write_scope:
  - packages/llm-core/src/adapters/ai-sdlc/**
  - packages/llm-core/tests/adapters/ai-sdlc/**
  - packages/llm-core/docs/final-architecture/tasks/adapter-ai-sdlc.md
required_reading:
  - path: context/aifsd-research/profiles/ai-sdlc.md
    reason: "Use the versioned AI-SDLC resource model as source-format evidence."
  - path: packages/llm-core/docs/final-architecture/SPECIFICATIONS.md
    reason: "Preserve source evidence and authority separation while treating loss support as historical."
  - path: packages/llm-core/docs/final-architecture/EXTERNAL-CONTRACT-FIDELITY-IMPACT.md
    reason: "Treat this task's loss-based wording as historical and apply the current exact-contract correction."
read_scope:
  - context/aifsd-research/profiles/ai-sdlc.md
  - packages/llm-core/docs/final-architecture/SPECIFICATIONS.md
  - packages/llm-core/docs/final-architecture/EXTERNAL-CONTRACT-FIDELITY-IMPACT.md
  - packages/llm-core/src/specifications/**
  - packages/llm-core/src/features/evidence/**
review_owner: coordinator
updated_at: 2026-08-02
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

- 2026-08-02 — User explicitly authorized parallel adapter implementation.
  `codex-root` owns the task lease and delegates only the adapter source/test
  paths to a child worker; package publication remains out of scope.
- 2026-08-02 — Implemented the uncommitted AI-SDLC `v1alpha1` JSON resource
  qualification slice in `src/adapters/ai-sdlc/` with focused fixtures in
  `tests/adapters/ai-sdlc/`. Admission, approval, identity, role, and
  attestation material are retained as source evidence, never minted as
  llm-core authority. Unknown relationship targets receive explicit degraded
  diagnostics. Focused tests, package/test typechecks, lint, and package
  formatting pass.
- 2026-08-02 — Coordinator review passed after all remediation rounds. The
  reviewed implementation was committed on `main` at `cf3347d`; the full
  package baseline passed with 666 tests, 4 environment-gated skips, and no
  failures. Marked done; conditional publication remains separately gated.

## Handoff

Review passed for `cf3347d` (`feat(specifications): qualify framework
adapters`). AI-SDLC remains unpublished; conditional publication is owned by
the separate `adapter-ai-sdlc-release` task.
