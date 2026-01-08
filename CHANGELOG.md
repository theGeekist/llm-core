# Changelog

All notable changes to `@geekist/llm-core` are documented here. Stages map directly to minor
versions (`1.<stage>.0`). Patch releases will note fixes under the same stage entry. Dates for
historical stages are backfilled as needed.

## [Unreleased]

### Stage 16 — Runtime Policy + Legacy Port (planned)

- Retry policy resolution and adapter-safe retry metadata.
- Text splitter primitives (markdown + cosine).
- Prompt schema helpers and structured prompt recipe surface.
- Classification construct and similarity-greedy recipe.

## [1.21.0] - 2026-01-08

### Stage 21 — UI SDK Adapters + Host Glue (Out-of-Core)

- First public release.
- Added UI SDK adapters for AI SDK UI streams, assistant-ui commands, and OpenAI ChatKit events.
- Added EventStream helpers for UI transport and reference Node/Edge host glue.
- Documented UI adapter patterns and end-to-end integration flow.

## [1.20.0] - TBD

### Stage 20 — Interaction Sessions (Core)

- Added adapter-driven session orchestration (`SessionStore`, `SessionPolicy`).
- Added `createInteractionSession` with `MaybePromise`-safe send/load/save flow.
- Documented session usage and policy injection patterns.

## [1.19.0] - TBD

### Stage 19 — Interaction Core (Pipeline-Backed)

- Added interaction event protocol, reducer, and pipeline-backed runtime.
- Added optional EventStream transport and interaction step packs.
- Documented interaction core and projection semantics.

## [1.18.0] - TBD

### Stage 18 — Refactor Resume Mechanics (Updated Pipeline)

- Refactored resume mechanics to align with updated pipeline internals.
- Improved pause/resume state handling and rollback support.

## [1.17.0] - TBD

### Stage 17 — Docs Snippets + Import Rewrite

- Standardized docs snippets with real files and type-checked examples.
- Added import rewrite tooling for consistent docs code.

## [1.15.0] - TBD

### Stage 15 — Interrupt Parity + Rollback Semantics

- Unified pause/resume semantics across adapters.
- Added interrupt parity for event streams and rollback strategies.

## [1.14.0] - TBD

### Stage 14 — Composable Recipes (Step Packs)

- Added recipe packs with deterministic ordering and override semantics.
- Removed pipeline internals from public recipe surface.

## [1.13.0] - TBD

### Stage 13 — RAG Write Path + Missing Adapter Constructs

- Added vector store write path and ingestion support with diagnostics.
- Expanded adapter coverage (rerankers, memory, cache, media).
- Normalized streaming events across ecosystems.

## [1.12.0] - TBD

### Stage 12 — Cache Adapter & Session Persistence

- Added Cache adapter contract and in-memory cache primitive.
- Wired cache into resume/session persistence paths.

## [1.11.0] - TBD

### Stage 11 — Paused/Resume Mechanics (Internal Driver)

- Added pause/resume driver with pause kind metadata.
- Kept public API as run/resume outcomes (no generators).

## [1.10.0] - TBD

### Stage 10 — Adapter Dependency Signals

- Added adapter dependency metadata and runtime diagnostics.
- Added input diagnostics for adapter call sites.

## [1.9.0] - TBD

### Stage 9 — Adapter Registry + Primitives

- Added adapter registry for mix-and-match execution.
- Added adapter-free primitives for core workflows.

## [1.8.0] - TBD

### Stage 8 — Interoperability Adapters

- Added adapter implementations for AI SDK, LangChain, and LlamaIndex.
- Added construct-first interop mapping and integration tests.

## [1.8.1] - TBD

### Stage 8b — Model Execution Adapters

- Added model execution adapters with normalized outputs.
- Added schema support (JSON Schema + Zod) across ecosystems.

## [1.7.0] - TBD

### Stage 7 — Interface Discovery (Code + Docs)

- Documented ecosystem shapes and normalized contracts.
- Added parity/shape tests and interop scaffolding.

## [1.6.0] - TBD

### Stage 6 — Tests + SLOC Discipline

- Added modular test patterns and SLOC enforcement.

## [1.5.0] - TBD

### Stage 5 — Recipes + Plugin Catalogue Wiring

- Wired recipes to plugin catalogue for discovery and loading.

## [1.4.0] - TBD

### Stage 4 — Recipes + Minimum Capabilities

- Added minimum capability enforcement for recipes.

## [1.3.0] - TBD

### Stage 3 — Runtime + Outcome + Diagnostics

- Added runtime outcome model and diagnostics guarantees.
- Added explain/contract support on workflow builder.

## [1.2.0] - TBD

### Stage 2 — Extension Adapter (Pipeline Mapping)

- Added adapter mapping layer for external constructs.

## [1.1.0] - TBD

### Stage 1 — Builder + Plugin Composition

- Added Workflow.recipe builder with deterministic plugin composition.

## [1.0.0] - TBD

### Stage 0 — Alignment + Contracts (Docs First)

- Established recipe contract registry and docs-first alignment.
