---
architecture_version: 2
id: adapter-ai-sdk-native-contract-correction
title: Preserve the AI SDK native response contract
stage: adapters
status: done
priority: critical
preferred_owner_kind: codex
owner: codex-root
owner_kind: coordinator
lease_started_at:
lease_expires_at:
base_sha: ac788c7dbcfa779f305c7a4ceb02a99c1e9f3d93
branch: main
worktree: /Users/jasonnathan/Repos/@theGeekist/llm-core
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
updated_at: 2026-08-10
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

- Execution mode: shared-checkout.
- Execution rationale: the coordinator explicitly repartitioned this adapter
  correction from the concurrent release-history work so both can proceed in
  the canonical checkout without shared writes.
- Concurrency evaluation: `release-history-provenance` retains `bun.lock`,
  `packages/llm-core/package.json`, release and provenance scripts, changelogs
  and release documentation. This task owns only the AI SDK adapter sources,
  focused AI SDK tests, the public export characterisation, AI SDK adoption
  documentation and this task record.
- Swarm delegation: `codex-root -> release_v2_ledger` for this implementation
  slice. Base SHA: `ac788c7dbcfa779f305c7a4ceb02a99c1e9f3d93`.
- Replaced semantic-loss publication with an exact authority and closed
  operation-disposition matrix.
- Added an adapter-owned native contract whose redaction and observation ports
  preserve completion and stream facts without widening the neutral model
  result. Unsafe projections and failed observation reject the operation.
- Added exact-version fixtures for warnings, approvals, provider metadata,
  generated files, sources, stream parts and hostile proxy rejection.
- Applied the independent contract review: portable warning, response and
  structured-output projections now derive only from redacted values; observer
  and return snapshots are independently detached and deeply frozen.
- Added descriptor-safe snapshots that reject hidden data, accessors, symbols,
  sparse arrays and array extras without invocation, plus closed Provider 4
  `APICallError`, abort and generic-error family projections.
- Added step, final-step and generate-result projections for finish reasons,
  usage, request, response messages, performance and provider metadata. The
  matrix explicitly excludes executable model handles and execution-only step
  contexts rather than serialising live provider state.
- Added a clean-process pinned fixture using AI SDK 7.0.37's official
  `MockLanguageModelV4` and real result classes, isolated from the synthetic
  suite's process-wide Bun module mocks.
- Closed the final review findings: raw stream parts and provider-executed tool
  calls or results now reject before observation and portable projection.
- Moved every proxy guard ahead of `instanceof` and prototype reflection for
  error and generated-byte paths, with trap-count fixtures proving zero hostile
  `getPrototypeOf` calls.
- Closed generated-file and file-part descriptors against unknown strings,
  hidden data, accessors and symbols. Duplicate base64 and byte representations
  must agree exactly; recognised AI SDK storage fields are validated without
  invoking the SDK's lazy prototype accessors.
- No concurrent-task manifest, lockfile, changelog or release/provenance path
  was edited by this slice.

## Blocker

None. ADR-017 is accepted and governs this correction.

## Handoff

- Focused adapter tests: 39 passed, 0 failed. Public-export characterisation:
  5 passed, 0 failed.
- Package typechecking and `release:build` pass, including 727 package tests,
  4 exact-authority skips and 0 failures, followed by declaration and
  distribution emission.
- `docs:check` passed with 42 public pages, 153 package engineering pages, 6
  routing pages, 23 embedded snippets and snippet typechecking. `docs:build`
  passed.
- Targeted adapter ESLint, package formatting and `git diff --check` pass.
- No package-manifest or lockfile change is required for this correction.
- Independent receiving review approved the corrected native boundaries after
  live raw-part, proxy-trap and hidden-file probes.
