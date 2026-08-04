# ADR-010 — Qualified Specification Adapter Publication

Architecture version: v2
Status: accepted
Date: 2026-07-30
Owners: architecture coordinator
Affected tasks: adapter-openspec through adapter-bmad-release
Supersedes: ADR-009's per-adapter public-surface-decision requirement

## Context

ADR-009 keeps framework semantics in qualified adapters and originally required
each future adapter front to receive a separate public-surface decision. The adapter
implementation briefs then promised public fronts while excluding shared
package metadata from their write scopes.

Adapter implementation and conformance are independently parallelizable.
Publication is not: `package.json`, build entrypoints, TypeScript paths,
architecture expectations and packed-consumer fixtures are shared
coordinator-owned files.

Leaving publication inside each adapter brief either makes its declared write
scope false or forces unrelated adapter workers to contend on serialized
integration files.

## Decision

- Conditionally approve these qualified fronts:
  - `@geekist/llm-core/adapters/openspec`;
  - `@geekist/llm-core/adapters/pydantic-ai-spec`;
  - `@geekist/llm-core/adapters/ai-sdlc`;
  - `@geekist/llm-core/adapters/spec-kit`; and
  - `@geekist/llm-core/adapters/bmad`.
- Conditional approval does not claim implementation or conformance. A front
  is added only after its adapter task passes every declared fixture and
  support-level gate.
- Keep adapter implementation tasks scoped to adapter code, focused tests,
  support declarations and an integration handoff.
- Give each adapter a small coordinator-owned publication task that owns:
  - package exports;
  - build and declaration entrypoints;
  - TypeScript path mappings;
  - architecture/public-surface expectations;
  - package smoke fixtures;
  - public support documentation; and
  - isolated packed-consumer verification.
- specification-api and every adapter publication task run the complete hardened release
  gate: package `release:build`, isolated `test:package`, repository
  `docs:check` and package `format:check`. Focused tests supplement rather than
  replace this gate.
- Publication tasks depend only on their matching implementation task and this
  ADR. They conflict with every other specification-adapter publication task
  so only one may modify shared package files at a time.
- The root package entry remains unchanged. Each adapter stays qualified and
  may expose only portable core contracts plus its explicitly documented
  native boundary.
- Removing, renaming or aggregating these fronts requires a later superseding
  public-surface ADR.

## Consequences

OpenSpec, PydanticAI, AI-SDLC, Spec Kit and BMAD implementation work can proceed
independently after specification-api. Package integration remains deterministic and
truthful. The public export count grows only when an individual publication
task succeeds, so release evidence records the exact surface at each version.
