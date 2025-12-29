# Stage 17 — Docs Snippets + Import Rewrite (VitePress)

Status: complete.

Goal: Make docs code blocks come from real snippet files, typechecked locally, while rendering npm-style
imports in the published docs. This keeps snippets correct and prevents drift without forcing authors to
hand-edit import paths in every doc.

## Scope

- Add a snippet directory with real TypeScript/JavaScript files.
- Wire a VitePress markdown-it plugin to rewrite local alias imports to npm imports at render time.
- Update docs to include snippets via `<<<` where appropriate (start with recipes + adapters).
- Add a docs snippet typecheck command so CI can validate snippet files.

## Import Rewrite Rules

Keep snippet files using local aliases for type safety:

- `#adapters` -> `@geekist/llm-core/adapters`
- `#recipes` -> `@geekist/llm-core/recipes`
- `#workflow` -> `@geekist/llm-core/workflow`

At render time, rewrite these in code fences only. The docs should always show npm imports.

## Acceptance Criteria

- Snippet files compile under a `docs/snippets/tsconfig.json`.
- VitePress dev/build shows npm imports in rendered docs.
- No manual import swapping in markdown files.
- Docs remain readable and consistent with published package paths.

## Completion Checklist

- [x] Add `docs/snippets/` (initial set for recipes + adapters).
- [x] Add VitePress plugin to rewrite imports in code fences.
- [x] Add `docs:snippets:typecheck` script.
- [x] Update recipe/adapters docs to include snippets via `<<<`.
- [x] Update `internal/implementation-plan.md` with Stage 17 status.

## Notes

- Keep snippet imports local so they can resolve against `src/` and the current codebase.
- The rewrite plugin should be minimal and deterministic (no AST parsing required).
- Apply rewrites only to code fences (not prose).
