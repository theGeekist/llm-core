# Plan

Stage 2 focuses on completing the “DX spine”: recipe‑driven inference, clean lifecycle wiring, and zero‑surprise runtime
introspection. We’ll keep the surface minimal while ensuring diagnostics and contracts are always discoverable.

## Requirements

- Keep DX first: recipe name drives inference; no user‑facing generics on the happy path.
- Use pipeline API + extensions where it improves clarity, not where it adds type noise.
- Maintain MaybePromise behavior (sync + async).
- All modules/tests < 500 SLOC, with doc references per module.

## Scope

- In: Stage 2 features (extensions, diagnostics depth, capability discovery, runtime channel, outcome ergonomics).
- Out: Stage 3+ recipes beyond the core five; advanced integrations.

## Files and entry points

- src/workflow/runtime.ts
- src/workflow/builder.ts
- src/workflow/types.ts
- src/workflow/contract.ts
- src/workflow/explain.ts
- src/workflow/capabilities.ts
- src/workflow/plugins/\*
- Docs: docs/implementation-plan.md, docs/workflow-notes.md

## Data model / API changes

- Ensure Workflow.recipe(name) preserves literal inference through build/run.
- Confirm runtime diagnostics and explain snapshot match documented fields.
- Ensure contract output includes artefact keys in a discoverable, stable shape.

## Action items

[x] Audit Stage 1 runtime against pipeline extension points; wire helper stages and lifecycle stages with diagnostics for
missing hooks.
[x] Strengthen explain/capabilities: overrides, missing requirements, unused/shadowed registrations, and capability map.
[x] Formalize runtime channel (budget/persistence/resume/tracing) in types and propagate into pipeline execution.
[x] Outcome ergonomics: keep Outcome.match/Outcome.ok helpers minimal and align with docs.
[x] Expand tests for sync/async/maybeTry/maybeThen, lifecycle hook execution, diagnostics, and conflict scenarios.
[x] Update docs per change: Stage 2 checklist in docs/implementation-plan.md and DX notes in docs/workflow-notes.md.

## Testing and validation

- bun run typecheck
- bun run lint
- bun test with sync + async coverage and conflict scenarios

## Risks and edge cases

- Over‑typing extension outputs could leak complexity into the public surface.
- Missing lifecycle stages could silently skip hooks without diagnostics.
- Runtime channel might become a “bag of options” without clear separation.

## Open questions

- **Should `contract()` return the declared contract or the resolved contract with plugin contributions?**

  **Answer:** `contract()` returns the **declared recipe contract** (stable, versionable, and reviewable).

  - Use `explain()` to answer **why** the resolved shape happened (plugins, overrides, unused/shadowed, missing requirements).
  - If we need an explicit “resolved contract view”, expose it as a separate introspection API (illustrative names):
    - `contractView()` / `schema()` → declared contract + plugin contributions (introspection only; does not redefine the recipe promise).

- **Do we want a standard name for the “default” extension point across recipes?**

  **Answer:** Yes — reserve **`init`** as the conventional default lifecycle.

  - Plugins that omit `lifecycle` attach to `init`.
  - Recipes should schedule `init` in `extensionPoints` (recommended).
  - If a plugin targets a lifecycle that isn’t scheduled by the recipe, emit a warning/diagnostic (no silent skips).
