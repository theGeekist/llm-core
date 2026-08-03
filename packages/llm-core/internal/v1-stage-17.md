# Stage 17 — Docs Snippets + Import Rewrite (VitePress)

Status: complete.

Goal: Make docs code blocks come from real snippet files, typechecked locally, while rendering npm-style
imports in the published docs. This keeps snippets correct and prevents drift without forcing authors to
hand-edit import paths in every doc.

## Scope

- Add a snippet directory with real TypeScript/JavaScript files.
- Wire a VitePress markdown config hook to rewrite local alias imports to npm imports at render time.
- Update docs to include snippets via `<<<` where appropriate (start with recipes + adapters).
- Add a docs snippet typecheck command so CI can validate snippet files.

## Import Rules

Snippet files use the published `@geekist/llm-core` package subpaths directly.
The obsolete feature and adapter private-import aliases were removed at v2
convergence; only `#contracts` and `#shared/*` remain for package-internal
dependencies.

## Acceptance Criteria

- Snippet files compile under a `docs/snippets/tsconfig.json`.
- VitePress dev/build shows npm imports in rendered docs.
- No private-to-public import swapping in markdown files.
- Docs remain readable and consistent with published package paths.

## Completion Checklist

- [x] Add `docs/snippets/` (initial set for recipes + adapters).
- [x] Add VitePress plugin to rewrite imports in code fences.
- [x] Add `docs:snippets:typecheck` script.
- [x] Update recipe/adapters docs to include snippets via `<<<`.
- [x] Update `internal/v1-implementation-plan.md` with Stage 17 status.

## Notes

- Keep snippet imports aligned with the public package exports so typechecking
  verifies the same paths shown to consumers.
- Apply rewrites only to code fences (not prose).
