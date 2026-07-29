# Packaging and conformance

`@geekist/llm-core` 2 is ESM-only and declares Node.js 22 or newer. The package
smoke test installs a packed artifact into an isolated consumer and verifies all
19 runtime and declaration entry points.

## Conformance levels

| Level                | What it proves                                                                                                          |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Contract             | Portable model, tool, control, event, state, and continuation shapes satisfy the shared suite.                          |
| Local runner         | The TypeScript runner obeys preparation, event, control, effect, and terminal-result rules.                             |
| Deterministic remote | A fake remote runner exercises replay, drop, reorder, timeout, and correlation faults.                                  |
| Process transport    | A real Python process verifies language-neutral framing and identity behavior without claiming framework compatibility. |
| Exact runtime        | CI installs the assessed runtime version and executes its dedicated compatibility tests.                                |

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
