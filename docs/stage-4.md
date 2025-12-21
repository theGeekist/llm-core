# Plan

Stage 4 focuses on recipe defaults and minimum capability enforcement, keeping recipes as the source of truth and
ensuring diagnostics remain DX-first.

## Requirements

- Enforce recipe minimumCapabilities (default = warn, strict = error).
- Keep recipe defaults minimal and aligned with the catalogue.
- Keep runtime/Outcome surface unchanged.
- Update docs alongside code changes.

## Scope

- In: minimum capability checks, recipe defaults wiring, catalogue sync.
- Out: advanced adapters and external integrations.

## Files and entry points

- src/workflow/runtime.ts
- src/workflow/recipe-registry.ts
- docs/recipes-and-plugins.md
- docs/workflow-notes.md
- docs/implementation-plan.md

## Data model / API changes

- Diagnostics: add recipe minimum capability checks.
- Defaults: recipe registry includes minimal default plugins.

## Action items

[x] Add runtime diagnostics for missing recipe minimumCapabilities (default warn, strict error).
[x] Add tests for minimum capability enforcement (default vs strict).
[x] Define minimal default plugin sets per recipe (no heavy logic).
[x] Sync catalogue docs with registry defaults and capability names.
[x] Add a defaults vs overrides example in docs.

## Testing and validation

- bun run lint
- bun run typecheck
- bun test

## Risks and edge cases

- Over‑prescribing defaults could freeze recipes prematurely.
- Strict mode could fail unexpectedly if defaults drift from docs.

## Open questions

- None (revisit if defaults require richer semantics).
