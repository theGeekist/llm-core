# AGENTS.md

Purpose: guide contributions for the Workflow runtime design/implementation in this repo.
DX (developer experience) is the top priority after correctness.

## Priorities
1) Correctness (must not regress).
2) DX (ergonomics, readability, discoverability).
3) Determinism (stable ordering, predictable overrides).
4) Minimal surface area (small API, clear nouns/verbs).

## Hard Rules
- No user-facing generics except `Workflow.recipe(...)`.
- Prefer value-first APIs (e.g., `contract(myContract)` instead of `.as<Contract>()`).
- Runtime concerns live in `runtime` (budget, persistence, tracing, HITL adapters).
- Plugins carry behavioral concerns; recipes declare artefact contracts.
- Trace + diagnostics are always present in outcomes.

## Linting (Mandatory)
- Run `bun run lint` before finishing any change.
- Obey complexity and size limits:
  - `complexity <= 10`
  - `max-depth <= 4`
  - `max-lines <= 500` (skip blank lines/comments)

## Formatting (Mandatory)
- Run `bun run format:check` before finishing any change.
- If it fails, run `bun run format`.

## Testing (Mandatory)
- Run `bun run typecheck` for all code changes.
- Add tests for new behavior (unit over integration when possible).
- Each test file must be <500 SLOC.

## Code Style
- Return early, avoid deep nesting.
- Keep modules small and focused.
- Prefer pure functions and explicit data flow.
- Short, precise comments only for non-obvious logic.

## Documentation Discipline
- Update docs at each stage (see `docs/implementation-plan.md`).
- `docs/workflow-notes.md` is canonical; catalogue lives in `docs/recipes-and-plugins.md`.

## References
- Implementation plan: `docs/implementation-plan.md`
- Canonical overview: `docs/workflow-notes.md`
- Recipes + plugins: `docs/recipes-and-plugins.md`
