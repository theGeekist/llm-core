---
architecture_version: 2
id: adapter-pydantic-ai
title: PydanticAI AgentSpec compilation adapter
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
  - ADR-007
  - ADR-009
conflicts_with: []
write_scope:
  - packages/llm-core/src/adapters/pydantic-ai-spec/**
  - packages/llm-core/tests/adapters/pydantic-ai-spec/**
  - packages/llm-core/src/application/specification-compiler/public.ts
  - packages/llm-core/src/specifications/index.ts
  - packages/llm-core/tests/specifications/public-api.test.ts
  - packages/llm-core/tests/architecture/source-boundaries.test.ts
  - packages/llm-core/tests/conformance/pydantic-ai-compatibility.test.ts
  - packages/llm-core/internal/final-architecture/tasks/adapter-pydantic-ai.md
read_scope:
  - packages/llm-core/src/specifications/**
  - packages/llm-core/src/features/agent/**
  - packages/llm-core/src/features/tooling/**
  - packages/llm-core/src/features/model/**
  - /Users/jasonnathan/Repos/aifsd-agent-framework-research/profiles/pydantic-ai.md
review_owner: coordinator
updated_at: 2026-08-02
---

# adapter-pydantic-ai — PydanticAI AgentSpec compilation adapter

## Objective

Compile the accepted portable subset of an `llm-core` specification into the
exact supported PydanticAI `AgentSpec` boundary, proving runtime-specification
interoperability without making Python objects part of the TypeScript core.

## Deliverables

- An exact-version support declaration, initially pinned to the existing
  CI-verified PydanticAI v2.19.0 reference.
- Mapping for supported agent, model requirement, prompt, tool, context and
  evaluation semantics.
- A conversion report for unsupported runtime features and native extensions.
- A `CompiledSpecification<PydanticAgentDefinition>` that retains the
  compilation identity and internal `CompilationAuthoritySnapshot`.
- Cross-runtime fixtures and declaration/runtime package coverage.
- A coordinator handoff requesting conditional publication through adapter-pydantic-ai-release.

## Acceptance criteria

- Compilation requires an `AcceptedSpecificationHandle`.
- The adapter is invoked only by the application-owned compilation entrypoint
  after use-time authority validation; it does not interpret registration as
  continuing validity.
- No Python object or Pydantic type crosses a portable TypeScript contract.
- Native execution bindings stay adapter-qualified.
- A compiled spec does not imply that a Python runtime has been prepared or
  started.
- The `llm-core`-controlled PydanticAI preparation bridge accepts the compiled
  specification and revalidates it; a native `AgentSpec` extracted alone is never
  accepted as execution authority.
- Exact supported and unsupported fields are covered by fixtures.
- Conformance covers registration followed by expiry, policy change and source
  revision advancement; the adapter must not run for any stale case.
- Shared package metadata and packed-consumer expectations remain untouched;
  adapter-pydantic-ai-release owns publication.

## Verification

```sh
bun test packages/llm-core/tests/adapters/pydantic-ai-spec
bun test packages/llm-core/tests/conformance
bun run typecheck:packages
bun run typecheck:tests
bun run lint
```

## Coordinator integration authorization

- 2026-08-02 — During remediation review, the user explicitly confirmed
  coordinator authorization for the application-owned projection/preparation
  front and its shared specification, architecture, and conformance coverage.
  These shared paths are coordinator integration work; delegated adapter work
  remained confined to the adapter source/test paths.

## Work log

- 2026-08-02 — User explicitly authorized parallel adapter implementation.
  `codex-root` owns the task lease and delegates only the adapter source/test
  paths to a child worker; package publication remains out of scope.
- 2026-08-02 — Implemented the uncommitted PydanticAI `AgentSpec` 2.19.0
  qualification slice in `src/adapters/pydantic-ai-spec/` with focused
  fixtures in `tests/adapters/pydantic-ai-spec/`. Compilation takes the exact
  review-bound accepted decision through the public specification facade, which
  retains the registered handle and revalidates source, policy, and expiry
  authority before projection. Controlled effects reject; unsupported
  declarative semantics are reported. Native preparation remains application
  owned: the adapter deliberately does not expose a raw `AgentSpec` as runtime
  authority. Focused and conformance tests, package/test typechecks, lint, and
  package formatting pass (the pre-existing optional live PydanticAI test
  remains skipped).
- 2026-08-02 — Coordinator review passed after all remediation rounds,
  including the explicitly authorized shared specification projection and
  preparation façade. The reviewed implementation was committed on `main` at
  `cf3347d`; the full package baseline passed with 666 tests, 4
  environment-gated skips, and no failures. Marked done; conditional
  publication remains separately gated.

## Handoff

Review passed for `cf3347d` (`feat(specifications): qualify framework
adapters`). PydanticAI remains unpublished; conditional publication is owned
by the separate `adapter-pydantic-ai-release` task.
