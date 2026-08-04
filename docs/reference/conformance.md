# Packaging and conformance

`@geekist/llm-core` 2 is ESM-only and declares Node.js 22 or newer. The package
smoke test installs a packed artifact into an isolated consumer and verifies all
29 runtime and declaration entry points.

The repository-owned Bun version is recorded in `.bun-version`. Local release
qualification and every workflow use that exact version, and dependency
installation is frozen against the root lockfile.

## Conformance levels

| Level                | What it proves                                                                                                          |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Contract             | Portable model, tool, control, event, state, and continuation shapes satisfy the shared suite.                          |
| Local runner         | The TypeScript runner obeys preparation, event, control, effect, and terminal-result rules.                             |
| Deterministic remote | A fake remote runner exercises replay, drop, reorder, timeout, and correlation faults.                                  |
| Process transport    | A real Python process verifies language-neutral framing and identity behavior without claiming framework compatibility. |
| Exact runtime        | CI installs the supported runtime version and executes its dedicated compatibility tests.                               |

## First Python reference runtime

The exact Python compatibility target is `pydantic-ai-slim==2.19.0`. Its test
uses a real Python runtime and preserves real tool-call identity, arguments,
results, and message history for the supported path.

The adapter declares unsupported capabilities explicitly. It does not claim
cancel, resume, intervention, provider-session continuity, or meaningful-effect
execution where those semantics are not implemented.

## Reading a compatibility claim

A compatibility declaration is narrower than package installation. Check:

1. the exact runtime and version;
2. the supported input and spec subset;
3. declared semantic losses;
4. unsupported controls and state lifetimes;
5. the executable evidence backing the claim.

Transport success alone does not establish runtime conformance.

## Commands and evidence

| Gate                            | Command                                            |
| ------------------------------- | -------------------------------------------------- |
| Canonical release qualification | `bun run release:qualify:llm-core`                 |
| Shared repository tests         | `bun test`                                         |
| Package release checks          | `bun run --cwd packages/llm-core release:check`    |
| Packed consumer validation      | `bun run test:package`                             |
| External consumer fixtures      | `bun run qualify:external-fixtures`                |
| Source-size boundary            | `bun run check:sloc`                               |
| Documentation contracts         | `bun run docs:check`                               |
| Documentation rendering         | `bun run docs:build && bun run docs:mermaid:check` |

`release:qualify:llm-core` is the only supported npm-publication gate. It runs
the frozen install, package release build, packed consumer, external fixtures,
documentation, formatting, SLOC check and every registered conditional-surface
qualifier. Local `publish:npm` and tagged publication both delegate to it.

Published conditional surfaces register their deterministic qualification in
`scripts/release-qualifiers.json`. Any package export outside the sealed
unconditional-export inventory must appear in its mandatory `requiredSurfaces`
list and have exactly one registration, including the exact support window and
maintenance owner. An absent, duplicate, skipped or failing registration makes
release qualification fail closed.

SLOC policy version 1 is code-owned: the limit is exactly 500 physical lines,
the directory and suffix exclusions are canonical, and every legacy exception
must match the sealed set. Editing the baseline cannot raise the enforced limit
or hide source paths from measurement.

The exact-runtime suite is
`tests/conformance/pydantic-ai-compatibility.test.ts`. The process-transport
coverage lives in `tests/conformance/runner-conformance.test.ts`. These names
locate evidence; they do not create a published runtime adapter.
