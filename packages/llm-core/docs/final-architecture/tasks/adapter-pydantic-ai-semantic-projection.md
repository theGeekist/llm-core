---
id: adapter-pydantic-ai-semantic-projection
title: Align PydanticAI projection with accepted intent
stage: adapters
status: proposed
priority: normal
depends_on:
  - adapter-pydantic-ai
  - specification-exact-operation-contracts
  - specification-semantic-reconciliation
decision_dependencies:
  - ADR-009
  - ADR-016
  - ADR-017
conflicts_with: []
write_scope:
  - packages/llm-core/src/adapters/pydantic-ai-spec/**
  - packages/llm-core/tests/adapters/pydantic-ai-spec/**
  - packages/llm-core/docs/final-architecture/tasks/adapter-pydantic-ai-semantic-projection.md
required_reading:
  - path: context/aifsd-research/profiles/pydantic-ai.md
    reason: "Preserve the exact AgentSpec field and version boundary during projection."
  - path: packages/llm-core/docs/internal/REUSABLE-ABSTRACTION-REVIEW.md
    reason: "Apply the lax canonical comparator and specification-capture caveats."
  - path: packages/llm-core/docs/final-architecture/EXTERNAL-CONTRACT-FIDELITY-IMPACT.md
    reason: "Treat this task's loss-based wording as historical and apply the current exact-contract correction."
read_scope:
  - context/aifsd-research/profiles/pydantic-ai.md
  - packages/llm-core/docs/internal/REUSABLE-ABSTRACTION-REVIEW.md
  - packages/llm-core/docs/final-architecture/EXTERNAL-CONTRACT-FIDELITY-IMPACT.md
review_owner: coordinator
updated_at: 2026-08-04
---

# adapter-pydantic-ai-semantic-projection — Align PydanticAI projection with accepted intent

## Objective

Make the PydanticAI AgentSpec output a traceable projection of accepted typed
intent instead of a caller-authored target authorized by a matching legacy
aggregate fixture.

## Why this exists

The current fixture injects `modelRequirements`, `prompt`, `tools`, `context`
and `evaluation` into generic requirement nodes. The compiler ignores typed
node discriminants and emits agent identity, instructions and model primarily
from a separately supplied target.

## In scope

- Replace the five-field aggregate fixture with the canonical typed semantic
  fixture and explicit format-specific projection configuration.
- Derive or bind every emitted AgentSpec field to accepted intent or a named
  integration/runtime configuration source.
- Reject requested PydanticAI semantics that the exact projection operation
  cannot preserve; retain the native source and format configuration.
- Validate the actual compiler output with exact PydanticAI rather than only a
  parallel checked-in JSON fixture.
- Keep authority-lifecycle mocks only for the lifecycle behavior they prove.

## Out of scope

- Implementing the PydanticAI `AgentRunner` runtime adapter.
- Adding a local runner fallback.
- Publishing the adapter package front.

## Acceptance criteria

- No PydanticAI compiler fixture fabricates semantic absence by injecting all
  legacy aggregate keys into every accepted item.
- A changed accepted agent/tool/context/evaluation binding changes or rejects
  the projected target deterministically.
- Unrelated caller-supplied agent identity, instructions or model cannot gain
  authority from an accepted dummy requirement.
- The exact Python qualifier validates serialized output produced by the
  compiler and cannot pass by validating only a static fixture.

## Verification

```sh
bun test packages/llm-core/tests/adapters/pydantic-ai-spec
bun run --cwd packages/llm-core typecheck:tests
bun run check:sloc
```

## Work log

Not started. This is specification projection work, distinct from the proposed
PydanticAI runtime integration.

## Handoff

Pending.
