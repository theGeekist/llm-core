# Developer Notes (Stage 3 Promises)

These are the Stage 3 guarantees for implementation and review. They are intentionally small and DX-first.

## Runtime Semantics

- `run()` accepts a runtime channel for operational concerns (reporter, budget, persistence, resume adapter, trace sink).
- `run()` returns an Outcome union with trace + diagnostics always present.
- Sync or async is supported via MaybePromise.

## Diagnostics

- Diagnostics are normalized into structured entries with `level`, `kind`, and `message`.
- `runtime.diagnostics` controls severity:
  - `default`: collect + report, no blocking.
  - `strict`: error diagnostics short-circuit into an error outcome.
- Missing plugin requirements are evaluated against **effective** plugins only.

## Capability Resolution

Capabilities are resolved via reducers. Each capability key has an explicit reducer that defines how
values combine.

Current reducers (explicit capabilities):

- `tools`: merge arrays
- `retriever`: replace
- `model`: replace
- `evaluator`: replace
- `embedder`: replace
- `resume`: replace
- `recipe`: replace
- `trace`: replace
- `dataset`: replace
- `textSplitter`: replace
- `reranker`: replace
- `loader`: replace
- `transformer`: replace
- `memory`: replace
- `storage`: replace
- `kv`: replace
- `prompts`: replace
- `schemas`: replace
- `documents`: replace
- `messages`: replace
- unknown keys: collect (mergeArrays fallback; scalars become arrays)

Adapter-derived capability presence is applied in a second pass and only fills missing keys.
List-like adapter keys (documents/messages/tools/prompts/schemas) are exposed as `true` presence flags,
while full lists stay on `wf.adapters()` (resolved adapters).

## Overrides and Extensions

- Overrides apply consistently across:
  - capabilities
  - helper kinds
  - extension registration (hooks/register)
- Overridden plugins do not register extensions.

## Resume Surface

- Resume exists only for recipes that declare `supportsResume`.
- Resume routes through `runtime.resume.resolve(...)` when present and returns an error outcome when missing.

## DX Commitments

- No user-facing generics for the happy path.
- Recipe name drives inference.
- Small, readable modules (<500 SLOC) with early returns and minimal nesting.

## Docs + Release

- Docs site is VitePress (`docs/`) and publishes to GitHub Pages on `main`.
- Releases are tag-driven (`vX.Y.Z`) and publish to npm + GitHub.
- See `docs/release.md` for the exact workflow + secrets.
