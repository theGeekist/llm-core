> **Credit & provenance:** Continues the Architecture v2 review guidance prepared
> by `codex-root` from accepted ADRs, implementation evidence and prior security
> and correctness reviews. Last materially updated by `codex-root` on 2026-08-03
> for source-layout governance and context pruning; Git retains earlier
> snapshots.

# Review Architecture v2 code

Review in `/Users/jasonnathan/Repos/@theGeekist/llm-core` unless the task names a
dedicated checkout. The reviewer does not change task state.

## Evidence to load

Run `bun run tasks:plan --authority all`, then
`bun run tasks:context -- <authority>/<task-id>`. Open every generated item,
including every task-specific `required_reading` entry, before reading the
task-scoped staged and unstaged diff against `base_sha`. Inspect nearby source
and failure-path tests. `read_scope` is additional inspection authority, not a
replacement for generated context.

## Review

- Enforce `write_scope`, dependency direction, curated fronts and no deep
  feature imports.
- Enforce shallow owner/file layout, descriptive kebab-case filenames and the
  `public.ts`/`index.ts` front distinction.
- Keep portable records separate from current authority, credentials,
  framework-native values and durable runtime state.
- Preserve `MaybePromise`, stream terminals, pause/resume, cancellation,
  rollback, idempotency, fencing and reconciliation semantics.
- Require controlled effects to retain policy, approval, receipt and evidence
  checks; recovery must not guess ambiguous outcomes.
- Verify exact adapter versions, supported and unsupported operation matrices,
  direct dependencies and isolated fixtures. Publication must leave a durable,
  non-skipping registered qualifier.
- Apply current backend or frontend slice guidance where applicable. Check that
  feature-owned user-facing strings remain identifiable, protocol/reason codes
  remain language-neutral and deployment choices enter through application
  configuration rather than hidden module literals.
- For `./client`, Metro evidence supports only the pinned React Native/Metro
  library window—not native modules or application lifecycle behavior.
- Treat roughly 500 SLOC as the target. Accept the lightweight
  `approximately 500 lines` waiver for 501 through 600 lines without requiring
  decomposition or a follow-up; enforce the hard boundary above 600 and every
  task-specific release/package gate.

Run focused and adjacent checks, then the task-required type, lint, package and
whitespace gates. Reject evidence polluted by overlapping writers or workspace
fallback.

Report each actionable `P0`–`P2` finding in its own copyable `md` block with
file/line, invariant, reproduction, impact and required correction. Put approval
and verification evidence in ordinary Markdown. The coordinator owns commit,
integration and final task/STATUS transition after approval.
