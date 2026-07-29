---
architecture_version: 2
id: P0-160
title: Convert AI SDK adapter to version 7
phase: P0.4
status: review
priority: P0
preferred_owner_kind: codex
owner: codex-root
owner_kind: codex
lease_started_at: 2026-07-29T19:27:00+08:00
lease_expires_at: 2026-07-30T19:27:00+08:00
base_sha: 23f88ee
branch: task/P0-160-codex
worktree: /Users/jasonnathan/Repos/@theGeekist/llm-core/.worktrees/P0-160-codex
depends_on:
  - P0-110
  - P0-120
  - P0-155
decision_dependencies:
  - ADR-004
  - ADR-005
  - ADR-007
conflicts_with: []
write_scope:
  - bun.lock
  - packages/llm-core/package.json
  - packages/llm-core/src/adapters/ai-sdk/**
  - packages/llm-core/src/adapters/ai-sdk-ui/**
  - packages/llm-core/src/adapters/model-selection.ts
  - packages/llm-core/src/adapters/providers/ai-sdk/**
  - packages/llm-core/tests/adapters/**
  - packages/llm-core/tests/adapters/ai-sdk7/**
  - packages/llm-core/tests/integration/**
  - packages/llm-core/tests/interop/**
  - packages/llm-core/internal/final-architecture/tasks/P0-160-ai-sdk7-adapter.md
read_scope:
  - packages/llm-core/src/features/**
review_owner: coordinator
updated_at: 2026-07-29
---

# P0-160 — Convert AI SDK Adapter to Version 7

## Objective

Implement the AI SDK 7 provider adapter behind frozen model, tool and event
contracts without widening the portable API.

## In scope

The active manifest/lock upgrade; current and target AI SDK provider adapters;
AI SDK UI compatibility; direct AI SDK adapter, integration and interoperability
tests; multipart streams; structured output; tool approval; cancellation;
warnings; usage; and native metadata. Development and verification use the
exact AI SDK 7 matrix recorded by P0-155.

## Out of scope

Neutral interaction/session orchestration, non-AI-SDK UI projections, root
exports and final legacy-directory deletion. P0-170 owns the architectural UI
projection migration after this task establishes a green AI SDK 7 compatibility
baseline; P0-150 owns final convergence and deletion.

## Acceptance criteria

- Contract tests cover normal and partial/failure streams.
- Native data survives under extensions.
- Tool approval and cancellation map without bypassing core control.
- Known semantic loss and supported AI SDK version are recorded.
- Manifest placement is explicit for every direct AI SDK package; the direct
  AI 5/React 2 overrides are removed without a global AI SDK 7 override.
- Qualified integrations may retain isolated transitive AI SDK 4/5/6
  generations; tests assert the direct adapter uses the recorded v7 matrix.
- The manifest/lock change, provider conversion and AI SDK UI compatibility
  conversion pass together; no red dependency-only state is integrated.

## Verification

```sh
bun install --frozen-lockfile
bun test packages/llm-core/tests/adapters/ai-sdk7
bun run build
bun run test:package
bun run typecheck:packages
```

## Work log

- 2026-07-29T19:27:00+08:00 — Claimed by the Codex coordinator after P0-155
  integrated and passed receiving verification.
- 2026-07-29 — Worker moved the task to `in_progress` and began the atomic
  manifest, provider-adapter and AI SDK UI compatibility conversion.
- 2026-07-29 — Upgraded the exact direct AI SDK provider/UI matrix and lockfile,
  removed the direct AI 5/React 2 overrides, and retained qualified transitive
  AI SDK 4/5/6 generations without a global v7 override.
- 2026-07-29 — Converted compiled legacy adapter/UI surfaces to AI SDK 7
  (`instructions`, async UI message conversion, aggregate `usage`, `stream`,
  `Output.object`, v7 embedding/tool types and finish reasons).
- 2026-07-29 — Added the qualified Architecture v2 provider adapter behind the
  frozen model front. Tool definitions have no executor, approval can only deny
  or request user approval, cancellation enters through a trusted AbortSignal
  resolver, and native metadata is omitted unless trusted composition returns
  a redacted JSON projection.
- 2026-07-29 — Moved to `review` after frozen install, contract tests, the full
  package suite, build, package smoke, typecheck and relevant lint passed.
- 2026-07-29 — Amended the review candidate to require strict JSON tool-call
  input, scope provider/core tool-call correlation per invocation, detect
  collisions in both directions, preserve representable multipart tool
  results, and reject unresolved media references.
- 2026-07-29 — Added regression coverage for concurrent invocation identity,
  generated and unknown ID failures, dynamic non-JSON input, approval denial,
  actual stream aborts, multipart output and async AI SDK UI conversion; all
  receiving gates passed.

## Handoff

Status: review.

### Commits

- `a795dc2` — atomic manifest/lock migration, AI SDK 7 compatibility conversion,
  qualified v2 provider adapter and contract tests.
- `4821822` — fail-closed correction removing executable tools from the legacy
  AI SDK compatibility path.
- `832b5f0` / `7098877` — net-zero boundary probe: a qualified-front export
  required the integration-owned public-export characterization update, so the
  worker removed it and deferred that convergence change to P0-150.
- `c3f2825` — review amendments hardening tool input, result projection,
  approval denial and invocation-scoped correlation boundaries.
- The implementation worktree was clean at `c3f2825` before this handoff-only
  task update.

### Changed files

- `bun.lock`
- `packages/llm-core/package.json`
- `packages/llm-core/src/adapters/ai-sdk-ui/interaction.ts`
- `packages/llm-core/src/adapters/ai-sdk/embeddings.ts`
- `packages/llm-core/src/adapters/ai-sdk/messages.ts`
- `packages/llm-core/src/adapters/ai-sdk/model-call.ts`
- `packages/llm-core/src/adapters/ai-sdk/model.ts`
- `packages/llm-core/src/adapters/ai-sdk/tools.ts`
- `packages/llm-core/src/adapters/providers/ai-sdk/index.ts`
- `packages/llm-core/src/adapters/providers/ai-sdk/messages.ts`
- `packages/llm-core/src/adapters/providers/ai-sdk/metadata.ts`
- `packages/llm-core/src/adapters/providers/ai-sdk/model.ts`
- `packages/llm-core/src/adapters/providers/ai-sdk/tools.ts`
- `packages/llm-core/src/adapters/providers/ai-sdk/types.ts`
- `packages/llm-core/tests/adapters/ai-sdk.model.test.ts`
- `packages/llm-core/tests/adapters/ai-sdk.messages.test.ts`
- `packages/llm-core/tests/adapters/ai-sdk7/model.test.ts`
- `packages/llm-core/tests/adapters/ai-sdk7/tool-boundary.test.ts`
- `packages/llm-core/tests/adapters/ai-sdk7/versions.test.ts`
- `packages/llm-core/tests/adapters/telemetry.test.ts`
- `packages/llm-core/tests/adapters/tools.test.ts`
- `packages/llm-core/tests/interop/embeddings.test.ts`
- `packages/llm-core/tests/interop/model-call.test.ts`
- `packages/llm-core/tests/interop/tools.test.ts`
- `packages/llm-core/internal/final-architecture/tasks/P0-160-ai-sdk7-adapter.md`

### Verification

- `bun install --frozen-lockfile` — exit 0; 1,394 installs across 1,236
  packages checked with no changes.
- Focused AI SDK 7 and message conversion suite — exit 0; 32 pass.
- Focused AI SDK 7, compatibility, UI and interop suite — exit 0; 110 pass.
- Post-hardening AI SDK 7/model/tool suite — exit 0; 33 pass.
- `bun test packages/llm-core/tests` — exit 0; 1,167 pass, 35 credential-gated
  integration tests skipped, 0 fail.
- `bun run build` — exit 0.
- `bun run test:package` — exit 0; 15 ESM runtime targets loaded and stale
  CommonJS cleanup verified.
- `bun run typecheck:packages` — exit 0; package typecheck and contract schema
  freshness passed.
- `bun run --cwd packages/llm-core typecheck:tests` — exit 0.
- Relevant adapter/integration/interop ESLint invocation — exit 0.
- `git diff --check` — exit 0.

### ADR posture

- ADR-004: the adapter returns the frozen `Model` port and registered profile;
  credentials and provider factories remain outside the portable request.
- ADR-005: neither the v2 nor compatibility AI SDK tool definition carries an
  executor. Provider approval can deny or request approval but cannot authorize
  an effect, so execution must return through the control kernel.
- ADR-007: the direct tested matrix is exactly `ai@7.0.37`,
  `@ai-sdk/provider@4.0.3`, `@ai-sdk/provider-utils@5.0.12`,
  `@ai-sdk/openai@4.0.20`, `@ai-sdk/anthropic@4.0.21` and
  `@ai-sdk/react@4.0.40`; no global AI SDK override was added.
- No ADR deviation.

### Shared-file request for P0-150

- `packages/llm-core/src/adapters/ai-sdk/index.ts`: replace the legacy public
  adapter surface with exports from
  `packages/llm-core/src/adapters/providers/ai-sdk/index.ts`.
- `packages/llm-core/tests/architecture/public-exports.characterization.test.ts`:
  update the `./adapters/ai-sdk` value/type export characterization in the same
  convergence commit. P0-160 deliberately leaves both shared surfaces unchanged.

### Known semantic loss and remaining risks

- A `SchemaRef` carries identity, not a schema document; the v2 adapter uses
  AI SDK 7 unstructured JSON output until a trusted schema resolver exists.
- `media-ref` input and tool-result output must be resolved by composition
  before invocation.
- Multipart JSON tool-result parts use `application/json` file parts because AI
  SDK 7 content output has no JSON part; the JSON value remains losslessly
  serialized but changes representation at that boundary.
- Provider warning text is replaced with a stable redacted warning. Native
  metadata is omitted unless an injected redactor supplies safe JSON.
- The frozen stream contract has no field for provider-native or approval
  metadata; stream tool calls still reach core control, while those native
  fields are not projected.
- `ModelError` has no cancellation code, so AI SDK aborts map to `timeout`.
- Generated provider files and sources lack a lossless frozen content
  projection and are not surfaced by this adapter version.
