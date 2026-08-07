---
architecture_version: 2
id: core-media-schemas-skills
legacy_id: P0-143
title: Implement media, schema resolution and skill fronts
stage: core
status: done
priority: critical
preferred_owner_kind: codex
owner: codex-root
owner_kind: codex
lease_started_at: 2026-07-29T23:56:00+08:00
lease_expires_at: 2026-07-30T23:56:00+08:00
base_sha: 16290df
branch: task/P0-143-codex
worktree: /Users/jasonnathan/Repos/@theGeekist/llm-core/.worktrees/P0-143-codex
depends_on:
  - core-contracts
  - core-model-runtime
  - core-agent-runner
  - core-ai-sdk-adapter
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
  - packages/llm-core/docs/final-architecture/tasks/core-media-schemas-skills.md
required_reading:
  - path: docs/capabilities/agent-skills.md
    reason: "Preserve the implemented skill and schema ownership boundary."
  - path: packages/llm-core/docs/v1-implementation-plan.md
    reason: "Reconstruct the pre-v2 aggregate capability assumptions this slice replaced."
    ref: 8844ac3989e497a762fa43f23fd93e40803d2174
read_scope:
  - docs/capabilities/agent-skills.md
  - packages/llm-core/docs/v1-implementation-plan.md
review_owner: coordinator
updated_at: 2026-07-30
---

# core-media-schemas-skills — Media, Schema Resolution and Skills

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

- 2026-07-29T23:56:00+08:00 — Claimed by the Codex coordinator after core-interactions
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
- 2026-07-30 — Closed exact-tip review findings with core-owned SHA-256
  verification for schema and media bytes, exact nested resource
  reconstruction, source-bound media projection, portable AgentSpec/skill
  enforcement and a single redacting native-metadata projection policy.
- 2026-07-30 — Re-ran focused and relevant parity suites plus package/test
  typechecks, schema freshness, scoped lint and diff checks; task remains in
  `review` for coordinator integration.
- 2026-07-30 — Closed follow-up review gaps by changing normalized sensitive
  and locator key policies to containment matching, with installed LangChain
  and LlamaIndex prompt regressions plus recursive AgentSpec locator cases.
- 2026-07-30 — Independently approved at exact SHA
  `2f3d9e9406df19672288b3b45dcb26b04eb003fd`, integrated into `main`, and
  completed after the receiving suite passed with 1,312 tests, 35
  credential-gated skips and no failures.

## Handoff

- Review candidate: task branch HEAD; the exact clean SHA is reported to the
  coordinator after this handoff is committed.
- Review-fix candidate: follow-up task branch HEAD; its exact clean SHA is
  reported to the coordinator after the remediation handoff is committed.
- Changed files are confined to the declared core-media-schemas-skills write scope.
- Verification:
  - focused media/schema/skills suite — 14 passed, 0 failed, 47 assertions;
  - relevant legacy parity and agent specification suite — 44 passed,
    3 environment-gated integrations skipped, 0 failed;
  - `bun run typecheck:packages` — exit 0, including schema freshness;
  - `bun run --cwd packages/llm-core typecheck:tests` — exit 0;
  - scoped ESLint and `git diff --check` — exit 0.
  - remediation-focused suite — 18 passed, 0 failed, 67 assertions;
  - remediation parity suite — 60 passed, 3 environment-gated integrations
    skipped, 0 failed, 125 assertions.
  - containment follow-up suite — 18 passed, 0 failed, 70 assertions; package
    and test typechecks, schema freshness, scoped lint and diff checks passed.
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
- Review remediation:
  - `SchemaDocumentResolver` returns exact published/canonical UTF-8 bytes and
    schema identity; core computes SHA-256, decodes strict JSON and brands only
    after byte digest and identity agreement;
  - media resource and binary integrity is recomputed from bytes, nested
    resource references are reconstructed with exact keys and projector output
    must preserve source media type, byte length and SHA-256 digest;
  - AgentSpec metadata rejects physical-locator shapes, skill identities are
    unique and disabled IDs are filtered even when a loader ignores them; and
  - LangChain, installed LlamaIndex prompt templates and safe AI SDK scalar
    extensions use the same redacting metadata policy.
- Runtime note: core-side SHA-256 uses `node:crypto` under ADR-007's Node 22
  baseline to preserve synchronous `MaybePromise` behavior. This implementation
  does not claim browser or Edge-runtime neutrality.
- Remaining risks: `MediaOutputProjector`, `MediaResourceResolver` and
  `SchemaDocumentResolver` are trusted host boundaries. Hosts must authorize
  the supplied invocation context and make their digest/integrity claims
  truthfully.
- Shared-file requests:
  - core-capability-bindings should bind the new media/resource/schema/skill ports without
    introducing provider controls into their portable inputs.
  - core-convergence should expose
    `src/adapters/providers/ai-sdk/media/public.ts` through the qualified
    `./adapters/ai-sdk` front. The neutral media contracts are already
    re-exported by the curated model feature front.
