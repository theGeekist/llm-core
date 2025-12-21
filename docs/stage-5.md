# Plan

Stage 5 focuses on recipe defaults wiring and keeping the plugin catalogue in sync with the registry.

## Requirements

- Default plugins remain minimal and deterministic.
- Catalogue entries mirror registry defaults and capability names.
- Docs stay aligned with code (no drift).

## Scope

- In: recipe defaults, catalogue sync, defaults vs overrides documentation.
- Out: advanced plugin behavior or external adapters.

## Files and entry points

- src/workflow/recipe-registry.ts
- docs/recipes-and-plugins.md
- docs/workflow-notes.md
- docs/implementation-plan.md

## Data model / API changes

- None (defaults and docs only).

## Action items

[x] Define minimal default plugins per recipe in the registry.
[x] Sync catalogue defaults to registry keys and capability names.
[x] Add defaults vs overrides example in docs.

## Testing and validation

- bun run lint
- bun run typecheck
- bun test

## Risks and edge cases

- Defaults can become stale if docs and registry diverge.

## Open questions

- None.
