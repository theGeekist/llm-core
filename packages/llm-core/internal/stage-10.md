# Stage 10 — Adapter Dependency Signals

Purpose: make adapter dependencies explicit at the adapter level (not a central map),
so beginners get actionable warnings when obvious prerequisites are missing.

## Goals

- Add dependency metadata where an adapter has a hard construct dependency.
- Emit runtime diagnostics based on adapter-declared requirements.
- Add optional runtime input diagnostics for missing data at adapter call sites.
- Keep the mechanism value-first and adapter-owned (no new registry).
- Document expected dependencies per construct.

## Approach (no new concepts)

Use the existing `metadata` field on adapters with a standard key:

```
type AdapterRequirement =
  | { kind: "construct"; name: string }
  | { kind: "capability"; name: string };

metadata: { requires: AdapterRequirement[] }
```

Registry reads `metadata.requires` from resolved adapter constructs (and custom constructs)
and emits diagnostics when requirements are missing. Default mode warns; strict mode escalates.

## Implementation

1. Define adapter requirement types + helpers:

   - `AdapterRequirement` union (construct + capability)
   - `readAdapterRequirements(adapters: AdapterBundle): AdapterRequirement[]`

2. Add registry warnings:

   - Compare `metadata.requires` to resolved adapter presence + capability presence.
   - Emit `construct_dependency_missing` / `capability_dependency_missing` diagnostics
     with literal, beginner-friendly messages.

3. Apply metadata.requires where adapters have hard dependencies:

   - Rerankers require a retriever

4. Add optional input validation helpers:

   - Validate missing inputs for model/retriever/reranker/splitter/transformer/embedder.
   - Emit `*_missing` diagnostics via `AdapterCallContext.report` (model uses result diagnostics).

5. Document dependencies in `docs/adapters-api.md` and `docs/workflow-notes.md`.

## Status

Completed.

## Notes

- Adapter dependency diagnostics are emitted during registry resolution.
- Runtime adapter input diagnostics are surfaced via `AdapterCallContext` wrappers.

## Construct dependency checklist

Current adapter suite:

- `reranker` -> `retriever`

Notes:

- Input-shape expectations (e.g., splitters expect text) are recipe-level concerns, not adapter dependencies.
- Provider internals (e.g., rerankers using their own models) are encapsulated inside the adapter and do not require
  external constructs.

## Tests

- Unit: metadata.requires is surfaced for each adapter family.
- Runtime: missing dependencies produce diagnostics (warn default, error strict).
- Integration: one example per construct showing the warning.

## Exit criteria

- Every adapter factory sets `metadata.requires` when a hard dependency exists.
- Input validation helpers exist and are used by adapters that can short-circuit on missing inputs.
- Runtime warns on missing deps without blocking by default.
- Docs reflect dependency semantics in plain language.
