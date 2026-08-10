# Changelog

Notable public changes to `@aifsd/llm-core` are recorded here. A release tag is accepted only after its version has a dated heading.

## [Unreleased]

Target version: 2.0.0.

### Breaking changes

- Replaced the v1 pipeline toolkit with a vendor-neutral contract, conformance, authority and evidence kernel. The v2 surface is intentionally not backwards compatible with the historical package.
- Publish ESM only and require Node.js 22 or newer.
- Replace the single barrel-oriented API with explicit package subpaths for contracts, model, tools, control, evidence, state, context, artefacts, evaluation, agent runtime, workflow intent, conversation, interaction, retrieval, indexing, storage, memory, media and specifications.

### Added

- Deterministic model resolution, portable tool contracts and controlled tool execution with policy, approval, cancellation and receipts.
- Pause, resume, rollback, streaming and evidence contracts built on the synchronous-or-asynchronous `MaybePromise` basis.
- Qualified adapter surfaces for AI SDK, AI SDK UI, Assistant UI, OpenAI ChatKit and NLUX.
- Independently versioned and qualified A2A 1.0 and stateless MCP 2026-07-28 protocol exports with isolated packed-consumer verification.
- Specification loading, compilation, review and exact-operation adapters for the supported external specification families.
- Package export, declaration, documentation, SLOC and external-runtime gates in the canonical release qualification command.

### Changed

- Extract strict JSON normalisation and immutable snapshot behaviour to the separately published `@aifsd/strict-json` dependency.
- Treat implementation, qualification and published support as separate evidence states.

See the [v2 migration guide](../../docs/reference/migration-2.md) for the replacement model and package surface.
