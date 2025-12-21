# Developer Notes (Stage 3 Promises)

These are the Stage 3 guarantees for implementation and review. They are intentionally small and DX-first.

## Runtime Semantics

- `run()` accepts a runtime channel for operational concerns (reporter, budget, persistence, HITL, trace sink).
- `run()` returns an Outcome union with trace + diagnostics always present.
- Sync or async is supported via MaybePromise.

## Diagnostics

- Diagnostics are normalized into structured entries with `level`, `kind`, and `message`.
- `runtime.diagnostics` controls severity:
  - `default`: collect + report, no blocking.
  - `strict`: error diagnostics short-circuit into an error outcome.
- Missing plugin requirements are evaluated against **effective** plugins only.

## Overrides and Extensions

- Overrides apply consistently across:
  - capabilities
  - helper kinds
  - extension registration (hooks/register)
- Overridden plugins do not register extensions.

## Resume Surface

- Resume exists only for recipes that declare `supportsResume`.
- Current behavior is a stub that returns an error outcome; adapter integration is deferred.

## DX Commitments

- No user-facing generics for the happy path.
- Recipe name drives inference.
- Small, readable modules (<500 SLOC) with early returns and minimal nesting.
