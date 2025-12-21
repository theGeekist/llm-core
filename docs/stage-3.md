# Plan

Stage 3 focuses on runtime semantics, outcome ergonomics, and diagnostics policy. The goal is to make runtime behavior
predictable and inspectable, while keeping the API surface thin and DX-first.

## Requirements

- Runtime channel drives operational concerns (reporting, budgets, persistence, HITL).
- Outcomes stay small and FP-friendly (ok | needsHuman | error).
- Diagnostics are always present; severity is configurable (default vs strict).
- Sync and async behaviors remain first-class via MaybePromise.
- Docs updated as part of the stage to avoid drift.

## Scope

- In: runtime defaults, diagnostics severity, optional resume flow, outcome helpers.
- Out: advanced recipe implementations or external adapters.

## Files and entry points

- src/workflow/runtime.ts
- src/workflow/outcome.ts
- src/workflow/types.ts
- src/workflow/diagnostics.ts (new)
- docs/workflow-api.md
- docs/runtime.md
- docs/workflow-notes.md

## Data model / API changes

- Add runtime diagnostics severity (default vs strict).
- Keep Outcome union stable; add helpers or examples only if needed.
- Resume should be present only for recipes that need it.

## Action items

Completed in Stage 3 (early, already in code):
[x] Runtime run() returns Outcome union with trace + diagnostics.
[x] Outcome helpers (Outcome.ok/match/mapOk) implemented.
[x] Runtime reporter flows into pipeline run options.

Remaining work:
[x] Implement diagnostics severity policy in runtime (default = collect, strict = fail).
[x] Create diagnostics helper module for mapping pipeline diagnostics into runtime outcomes.
[x] Implement resume flow for HITL recipes (surface exists; behavior is stubbed).
[x] Add tests for strict diagnostics and resume paths.
[x] Update docs with diagnostics severity and resume examples.

## Testing and validation

- bun run lint
- bun run typecheck
- bun test

## Risks and edge cases

- Strict diagnostics must not introduce false positives.
- Resume should not widen types for non-HITL recipes.
- Diagnostics must remain discoverable even on errors.

## Open questions

- None (defer to Stage 3 implementation choices as needed).
