---
architecture_version: 2
id: adapter-ai-sdk-native-contract-correction
title: Preserve the AI SDK native response contract
stage: adapters
status: proposed
priority: critical
preferred_owner_kind: codex
owner:
owner_kind:
lease_started_at:
lease_expires_at:
base_sha:
branch:
worktree:
depends_on:
  - architecture-external-contract-fidelity
  - core-ai-sdk-adapter
decision_dependencies:
  - ADR-017
conflicts_with: []
write_scope:
  - bun.lock
  - packages/llm-core/src/adapters/ai-sdk/**
  - packages/llm-core/src/features/model/**
  - packages/llm-core/tests/adapters/ai-sdk7/**
  - packages/llm-core/tests/architecture/public-exports-characterization.test.ts
  - packages/llm-core/package.json
  - docs/adapters/ai-sdk.md
  - packages/llm-core/docs/final-architecture/tasks/adapter-ai-sdk-native-contract-correction.md
required_reading:
  - path: context/aifsd-research/profiles/vercel-ai.md
    reason: "Use real AI SDK and gateway behaviour as contextual evidence for native response preservation."
  - path: packages/llm-core/docs/internal/REUSABLE-ABSTRACTION-REVIEW.md
    reason: "Apply the A08 native-metadata hostile-object caveat without inventing a global policy."
  - path: packages/llm-core/docs/final-architecture/EXTERNAL-CONTRACT-FIDELITY-IMPACT.md
    reason: "Use the exact AI SDK contract and fixture impact inventory."
read_scope:
  - context/aifsd-research/profiles/vercel-ai.md
  - packages/llm-core/docs/internal/REUSABLE-ABSTRACTION-REVIEW.md
  - packages/llm-core/docs/final-architecture/EXTERNAL-CONTRACT-FIDELITY-IMPACT.md
  - packages/llm-core/src/contracts/**
  - packages/llm-core/src/features/control/**
  - packages/llm-core/tests/**
review_owner: human
updated_at: 2026-08-07
---

# adapter-ai-sdk-native-contract-correction — Preserve the AI SDK native response contract

## Objective

Replace the AI SDK adapter's semantic-loss declaration with an exact,
versioned native response contract and explicit unsupported operations.

## In scope

- Remove `AI_SDK7_SEMANTIC_LOSS` and the `semanticLoss` extension contract.
- Preserve validated, namespaced and redacted provider metadata without silent
  omission.
- Preserve supported native warning, approval, generated-file, source and
  streaming metadata through an explicit AI SDK-owned surface.
- Reject an operation when required native data cannot cross the configured
  security boundary.
- Classify each exact AI SDK operation as `supported`, `unsupported` or
  `not-applicable`; require exact-version source evidence for every
  `not-applicable` entry.
- Update the published adapter front, package qualification and adversarial
  fixtures directly without compatibility aliases.
- Replace the public AI SDK adoption page's omission, generic-warning and
  semantic-loss guidance with the implemented exact native-response contract.

## Out of scope

- Adding provider-native fields to the portable model result merely for
  convenience.
- Returning secrets or unvalidated provider objects.
- Changing unrelated AI SDK media, retrieval or UI operations that already
  fail closed.

## Acceptance criteria

- No provider response succeeds after silently omitting supplied native
  metadata, warning detail, generated files, sources or stream-native events.
- Required redaction is explicit and executable; missing redaction support
  rejects the affected native operation.
- The published adapter exposes no semantic-loss list or support-by-loss field.
- Exact AI SDK version fixtures cover completion, stream, approval, warnings,
  metadata, files, sources, errors and security rejection.
- No missing or unqualified applicable operation is classified
  `not-applicable`.
- `docs/adapters/ai-sdk.md` describes only the executable preservation,
  rejection and security behaviour delivered by this correction.

## Verification

```sh
bun test packages/llm-core/tests/adapters/ai-sdk7 packages/llm-core/tests/architecture/public-exports-characterization.test.ts
bun run --cwd packages/llm-core typecheck
bun run --cwd packages/llm-core release:build
bun run release:qualify:llm-core
bun run docs:check
bun run docs:build
bun run --cwd packages/llm-core format:check
git diff --check
```

## Work log

Not started.

## Blocker

ADR-017 requires human acceptance.

## Handoff

Not started.
