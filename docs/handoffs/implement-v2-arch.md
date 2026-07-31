# Implement llm-core architecture v2

## Responsibility

This is the execution handoff. It records the live repository state, the implementation already present, and the order in which work should continue. It does not repeat documentation-review history or code-review evidence.

For those concerns, use:

- [V2 content review](./review-v2-content.md) for public documentation;
- [V2 architecture review](./review-v2-arch.md) for the current code-review finding; and
- [Code simplification review](./review-code-simplification.md) for functional and API simplification decisions.

## Live repository state

- Repository: `/Users/jasonnathan/Repos/@theGeekist/llm-core`
- Branch: `main`
- Recorded `HEAD`: `0b0bc9d` (`docs(architecture): start public language rollout`)
- `main` is three commits ahead of `origin/main` at this snapshot.
- The working tree intentionally contains the complete accessible-public-language rollout. It spans source, package exports, build configuration, tests, examples, snippets, and documentation. Do not reset, restore, or reconstruct it.
- The rollout task remains in `review`.
- A later review found a workflow immutability defect. The rollout is **not commit-ready** until the acceptance criteria in [the architecture review](./review-v2-arch.md) pass.

The preceding coordination commits are:

- `b87116c` — adopt accessible language stages;
- `17d2b38` — define exact public vocabulary and pin Pipeline 1.2.0; and
- `0b0bc9d` — begin the atomic language rollout.

## Implementation present in the working tree

The rollout converges the package on four ordinary journeys:

```ts
createAgent(...)
defineTool(...)
defineWorkflow(...)
createConversation(...)
```

Their ready-to-use values are `Agent`, `Tool`, `Workflow`, and `Conversation`. Advanced lifecycle and runtime mechanics are exposed from qualified feature fronts rather than the package root. The rollout also:

- replaces ambiguous V1 names across source and consumers;
- removes compatibility aliases and the public `./functional` subpath;
- retains functional helpers as internal implementation tools;
- updates the package to 29 ESM-only entrypoints;
- updates all repository call sites, tests, examples, docs, and packed-consumer coverage; and
- pins `@wpkernel/pipeline` 1.2.0, removing the earlier specification-compiler dependency blocker.

The implementation follows:

- [ADR-011: Accessible public language](../../packages/llm-core/internal/final-architecture/decisions/ADR-011-accessible-public-language.md)
- [ADR-012: Exact public vocabulary](../../packages/llm-core/internal/final-architecture/decisions/ADR-012-exact-public-vocabulary.md)
- [Canonical language guide](../../packages/llm-core/internal/final-architecture/LANGUAGE.md)
- [Language rollout task](../../packages/llm-core/internal/final-architecture/tasks/language-rollout.md)

## Validation baseline

Before the final review, the integrated tree passed:

- lint and package-wide formatting;
- package, test, example, and documentation-snippet typechecks;
- schema freshness checks;
- 522 tests with zero failures and one intentional optional live-PydanticAI skip;
- the package release build;
- the production documentation build;
- Chromium rendering of 22 Mermaid diagrams, including theme rerendering; and
- isolated packed consumption of all 29 runtime and declaration entrypoints.

These results are a baseline, not permission to skip validation after the review fix.

## Execution sequence

1. Inspect `git status`, `git diff --stat`, and `git diff --check`. Preserve the existing rollout.
2. Implement only the remediation specified by [the V2 architecture review](./review-v2-arch.md), including its regression coverage.
3. Run focused workflow tests, then rerun the full validation baseline above. Review the aggregate diff for accidental compatibility surfaces or incomplete call-site updates.
4. When every review finding is closed, commit the rollout atomically. The intended scope is `README.md`, `docs`, `examples`, and `packages/llm-core`; source, exports, tests, examples, and documentation must land together. Do not push unless explicitly requested.
5. In a separate governance change, mark `language-rollout` done, update architecture status, and move `specification-contracts` from blocked to ready.
6. Implement the specification sequence: [contracts](../../packages/llm-core/internal/final-architecture/tasks/specification-contracts.md) → [compiler](../../packages/llm-core/internal/final-architecture/tasks/specification-compiler.md) → [authority](../../packages/llm-core/internal/final-architecture/tasks/specification-authority.md) → [API](../../packages/llm-core/internal/final-architecture/tasks/specification-api.md).
7. Add qualified OpenSpec, PydanticAI, AI-SDLC, Spec Kit, and BMAD adapters only after the core specification contracts are stable and qualified.

## Execution references

- [Architecture overview](../../packages/llm-core/internal/final-architecture/README.md)
- [Current architecture status](../../packages/llm-core/internal/final-architecture/STATUS.md)
- [Implementation plan](../../packages/llm-core/internal/final-architecture/PLAN.md)
- [Coordination protocol](../../packages/llm-core/internal/final-architecture/COORDINATION.md)
- [Task index](../../packages/llm-core/internal/final-architecture/tasks/README.md)
- [Specification architecture](../../packages/llm-core/internal/final-architecture/SPECIFICATIONS.md)

## Execution guardrails

- Work from the existing local `main`; do not create a branch, pull, reset, rebase, or discard changes without explicit instruction.
- Do not add compatibility aliases, restore `./functional`, or broaden root exports for convenience.
- Keep portable specification data separate from runtime execution authority.
- Keep authenticated human approval distinct from specification decisions.
- Verify external dependency signatures and repository call sites before changing runtime, adapter, or resume contracts.
- Commit only when requested and only after the current review is closed.
