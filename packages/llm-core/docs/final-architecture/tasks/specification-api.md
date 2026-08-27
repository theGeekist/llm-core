---
id: specification-api
title: Specification API and format compatibility
stage: specifications
status: done
priority: high
depends_on:
  - specification-authority
decision_dependencies:
  - ADR-007
  - ADR-009
  - ADR-011
  - ADR-012
conflicts_with: []
write_scope:
  - packages/llm-core/index.ts
  - packages/llm-core/src/specifications/**
  - packages/llm-core/src/application/specification-compiler/**
  - packages/llm-core/src/application/tool-execution/types.ts
  - packages/llm-core/src/features/specifications/runtime.ts
  - packages/llm-core/src/agent/facade.ts
  - packages/llm-core/src/application/workflow/authority.ts
  - packages/llm-core/tests/specifications/**
  - packages/llm-core/tests/specification-compiler/compiler.test.ts
  - packages/llm-core/tests/specification-compiler/authority.test.ts
  - packages/llm-core/tests/architecture/**
  - packages/llm-core/package.json
  - packages/llm-core/scripts/build.ts
  - packages/llm-core/scripts/smoke-package.mjs
  - packages/llm-core/tsconfig.json
  - packages/llm-core/tsconfig.build.json
  - packages/llm-core/docs/final-architecture/tasks/specification-api.md
required_reading:
  - path: packages/llm-core/docs/final-architecture/SPECIFICATIONS.md
    reason: "Preserve the package front and graph-free review boundary while treating loss support as historical."
  - path: packages/llm-core/docs/final-architecture/LANGUAGE.md
    reason: "Preserve the common load, review and compile vocabulary without implied execution."
  - path: packages/llm-core/docs/final-architecture/EXTERNAL-CONTRACT-FIDELITY-IMPACT.md
    reason: "Treat this task's loss-based wording as historical and apply the current exact-contract correction."
read_scope:
  - packages/llm-core/docs/final-architecture/SPECIFICATIONS.md
  - packages/llm-core/docs/final-architecture/LANGUAGE.md
  - packages/llm-core/docs/final-architecture/EXTERNAL-CONTRACT-FIDELITY-IMPACT.md
  - packages/llm-core/src/features/specifications/**
  - packages/llm-core/src/application/specification-compiler/**
  - packages/llm-core/src/application/agent/**
  - packages/llm-core/src/application/workflow/**
review_owner: coordinator
updated_at: 2026-08-01
---

# specification-api — Specification API and format compatibility

## Objective

Publish the specification capability as one explicit package API and prove
multi-format compatibility with adapter-neutral fixtures.

## Deliverables

- `@geekist/llm-core/specifications` as the full extension specification front,
  with the common load/review/compile journey also exported from the root.
- Two deliberately unlike test dialects exercising source-oriented import and
  runtime-oriented compilation without publishing framework adapters.
- Support declarations that distinguish parsing, semantic preservation,
  review and executable-compilation support.
- Public `SpecificationDecision` and `CompiledSpecification<T>` contracts whose
  controlled preparation/execution integration is already proven by
  specification-authority. Authority snapshots and verification stay internal.
- Runtime, declaration and isolated packed-consumer verification for all 30
  public entries.

## Acceptance criteria

- The package root adds only `loadSpecification`, `reviewSpecification`,
  `compileSpecification` and their common facade contracts.
- Framework dependencies and native types do not leak into the core
  specification front.
- Unsupported source semantics are preserved under namespaced extensions,
  reported as degraded or rejected.
- OpenSpec, PydanticAI, AI-SDLC, Spec Kit and BMAD are documented as later
  qualified adapters, not implied support.
- Architecture tests reject deep feature/application imports.
- The complete package release, isolated consumer, documentation and formatting
  gates pass after the thirtieth front is added.

## Verification

```sh
bun test packages/llm-core/tests/specifications
bun test packages/llm-core/tests/architecture
bun run --cwd packages/llm-core release:build
bun run test:package
bun run docs:check
bun run --cwd packages/llm-core format:check
```

## Work log

- 2026-08-01 — Claimed on shared `main` after user accepted the
  `specification-authority` review. The direct-main assignment is deliberate:
  no active task overlaps this task's API/package write scope.
- 2026-08-01 — Reviewed `SPECIFICATIONS.md`, `LANGUAGE.md`, task protocol and
  ADR-007, ADR-009, ADR-011 and ADR-012 before implementation. The task will
  publish only the approved common journey and explicit specification front.
- 2026-08-01 — Implemented and committed `fa767d9`
  (`feat(specifications): publish specification API`). The root now publishes
  only load/review/compile; `./specifications` is the thirtieth explicit
  package front. Loaded graphs, accepted handles, authority snapshots and
  verification remain module-private. The task's source-oriented and
  runtime-oriented tests cover the two required adapter-neutral dialects.
- 2026-08-01 — Verification passed: focused specification and architecture
  suites; package/test typechecks; `release:build` (573 passed, 1 intentional
  skip); packed 30-entrypoint consumer; documentation check; and formatting.
  Shared compiler, Agent, workflow, and internal runtime-front changes are
  included in `fa767d9`; no external adapter was published or claimed.
- 2026-08-01 — Review returned the task to implementation for two P1 fixes:
  common Agent authority must always use the bound private verifier, and a
  policy needs a graph-free public review view from which it can derive scope.
- 2026-08-01 — Addressed both P1 findings in `ce4f5b0`
  (`fix(specifications): bind common review authority`). `AgentConfig` no
  longer accepts an authority override; common execution reads only the bound
  private verifier. Review policy now receives an immutable view of scope IDs,
  reviewable items, relationships, dependency/workflow selections, questions,
  and conversion diagnostics without exposing `SpecificationGraph`.
- 2026-08-01 — Reverification passed: focused type/specification/compiler/
  architecture suites; `release:build` (574 passed, 1 intentional skip);
  packed 30-entrypoint consumer; documentation check; and formatting.
- 2026-08-01 — Coordinator review passed. Marked done; no follow-on task is
  claimed.

## Handoff

Ready for coordinator review. Confirm the common `AgentConfig` has no
authority override and that a supplied runtime lookalike cannot replace the
facade-bound verifier after source-revision drift. Confirm policy scope is
derived solely from the frozen `SpecificationReviewView`, while the canonical
graph, accepted handle, authority snapshot, and verification remain private.
