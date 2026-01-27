# Plan

Status: completed.

Stage 6 focuses on test coverage, modular test suites, and keeping SLOC under control.

## Requirements

- Split tests into focused suites (no giant monolith).
- Add coverage for registry, defaults, diagnostics, and resume surface.
- Keep each test file under 500 SLOC.

## Scope

- In: new test files, helper reuse, missing coverage.
- Out: new runtime features or recipe changes.

## Files and entry points

- tests/workflow/\*.test.ts
- tests/workflow/helpers.ts
- docs/implementation-plan.md

## Action items

[x] Split existing workflow tests into smaller suites by domain.
[x] Add registry/defaults tests (contracts, defaults, overrides).
[x] Add diagnostics tests (default vs strict, normalisation).
[x] Add resume surface tests (presence + missing resume adapter outcome).
[x] Keep helpers reused across suites and limit duplication.

## Testing and validation

- bun run lint
- bun run typecheck
- bun test
- bun test --coverage --coverage-reporter=text

## Risks and edge cases

- Splitting tests can introduce helper drift if not centralized.
- Coverage gaps if suites aren’t scoped clearly.

## Open questions

- None.
