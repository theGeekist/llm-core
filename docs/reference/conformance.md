# Packaging and conformance

`@geekist/llm-core` 2 is ESM-only and declares Node.js 22 or newer. The package smoke test installs a packed artifact into an isolated consumer and verifies all 35 runtime and declaration entrypoints.

The repository-owned Bun version is recorded in `.bun-version`. Local release qualification and every workflow use that exact version, and dependency installation is frozen against the root lockfile.

## Conformance levels

| Level | What it proves |
| --- | --- |
| Contract | Portable model, tool, control, event, state, and continuation shapes satisfy the shared suite. |
| Local runner | The TypeScript runner obeys preparation, event, control, effect, and terminal-result rules. |
| Deterministic remote | A fake remote runner exercises replay, drop, reorder, timeout, and correlation faults. |
| Process transport | A real Python process verifies language-neutral framing and identity behavior without claiming framework compatibility. |
| Exact runtime | CI installs the supported runtime version and executes its dedicated compatibility tests. |

## First Python reference runtime

The exact Python target is `pydantic-ai-slim==2.19.0` at source commit `ed0f40c0e5061722f7d9f579ed7efff1b74e3ea5`. Its operation suite uses a real Python runtime and qualifies one bounded TestModel trajectory: a single `echo(value: string)` tool call, its matching return, and the exact four-message prompt/call/return/text history. It does not establish generic PydanticAI tool or message-history support.

`AgentRun.result()` returns only the closed kernel text output `{ kind: "text", text: string }`. `PydanticAiAgentRun.nativeResult()` validates an explicit bridge run identity and requires its native output to equal the cached portable terminal text before returning the separate observation. The portable text result and normalised lifecycle remain separate operations.

The adapter declares unsupported capabilities explicitly. It does not claim cancel, resume, intervention, provider-session continuity, or meaningful-effect execution where those semantics are not implemented.

## Reading an operation claim

An operation declaration is narrower than package installation. Check:

1. the exact runtime and version;
2. the exact portable or native operation identifier and owner;
3. its `supported`, `unsupported`, or `not-applicable` disposition;
4. exact-version source evidence for `not-applicable`; and
5. the executable fixture set backing each supported or unsupported claim.

Transport success and portable normalisation do not establish native runtime operation support.

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

`release:qualify:llm-core` is the only supported npm-publication gate. It runs the frozen install, package release build, packed consumer, external fixtures, documentation, formatting, SLOC check and every registered conditional-surface qualifier. Local `publish:npm` and tagged publication both delegate to it.

Published conditional surfaces register their deterministic qualification in `scripts/release-qualifiers.json`. Any package export outside the sealed unconditional-export inventory must appear in its mandatory `requiredSurfaces` list and have exactly one registration, including the exact support window and maintenance owner. An absent, duplicate, skipped or failing registration makes release qualification fail closed.

SLOC policy version 1 is code-owned: 500 physical lines is the target and 600 is the hard boundary. Files from 501 through 600 lines require only the exact `approximately 500 lines` waiver; size alone cannot require decomposition or a follow-up. Files above 600 use sealed legacy exceptions or the stronger versioned waiver with expiry and follow-up. Directory and suffix exclusions remain canonical, and editing the baseline cannot raise either threshold or hide source paths from measurement.

The exact-runtime suite is `tests/conformance/pydantic-ai-compatibility.test.ts`. The process-transport coverage lives in `tests/conformance/runner-conformance.test.ts`. These names locate evidence; they do not create a published runtime adapter.
