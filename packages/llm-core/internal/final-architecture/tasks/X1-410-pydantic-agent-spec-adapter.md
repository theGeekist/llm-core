---
architecture_version: 2
id: X1-410
title: PydanticAI AgentSpec projection adapter
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
  - ADR-007
  - ADR-009
conflicts_with: []
write_scope:
  - packages/llm-core/src/adapters/pydantic-ai-spec/**
  - packages/llm-core/tests/adapters/pydantic-ai-spec/**
  - packages/llm-core/internal/final-architecture/tasks/X1-410-pydantic-agent-spec-adapter.md
read_scope:
  - packages/llm-core/src/specifications/**
  - packages/llm-core/src/features/agent/**
  - packages/llm-core/src/features/tooling/**
  - packages/llm-core/src/features/model/**
  - /Users/jasonnathan/Repos/aifsd-agent-framework-research/profiles/pydantic-ai.md
review_owner: coordinator
updated_at: 2026-07-30
---

# X1-410 — PydanticAI AgentSpec projection adapter

## Objective

Project the admitted portable subset of an `llm-core` specification into the
exact supported PydanticAI `AgentSpec` boundary, proving runtime-specification
interoperability without making Python objects part of the TypeScript core.

## Deliverables

- An exact-version support declaration, initially pinned to the existing
  CI-verified PydanticAI v2.19.0 reference.
- Mapping for supported agent, model requirement, prompt, tool, context and
  evaluation semantics.
- A conversion report for unsupported runtime features and native extensions.
- A `ProjectionEnvelope<PydanticAgentSpecProjection>` that retains the
  projection identity and `ProjectionAuthoritySnapshot`.
- Cross-runtime fixtures and declaration/runtime package coverage.
- A coordinator handoff requesting conditional publication through X1-415.

## Acceptance criteria

- Projection requires a `RegisteredAcceptedSpecification`.
- The adapter is invoked only by the application-owned projection entrypoint
  after use-time authority validation; it does not interpret registration as
  continuing validity.
- No Python object or Pydantic type crosses a portable TypeScript contract.
- Native execution bindings stay adapter-qualified.
- A projected spec does not imply that a Python runtime has been prepared or
  started.
- The `llm-core`-controlled PydanticAI preparation bridge accepts the projection
  envelope and revalidates it; a native `AgentSpec` extracted alone is never
  accepted as execution authority.
- Exact supported and unsupported fields are covered by fixtures.
- Conformance covers registration followed by expiry, policy change and source
  revision advancement; the adapter must not run for any stale case.
- Shared package metadata and packed-consumer expectations remain untouched;
  X1-415 owns publication.

## Verification

```sh
bun test packages/llm-core/tests/adapters/pydantic-ai-spec
bun test packages/llm-core/tests/conformance
bun run typecheck:packages
bun run typecheck:tests
bun run lint
```

## Work log

Not started.

## Handoff

Pending.
