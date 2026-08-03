> **Credit & provenance:** Continues the Architecture v2 review guidance prepared
> by `codex-root` from accepted ADRs, implementation evidence and prior security
> and correctness reviews. Last materially updated by `codex-root` on 2026-08-03
> for source-layout governance and context pruning; Git retains earlier
> snapshots.

# Review Architecture v2 code

Review in `/Users/jasonnathan/Repos/@theGeekist/llm-core` unless the task names a
dedicated checkout. The reviewer does not change task state.

## Evidence to load

Read the selected task, its named ADRs and the task-scoped staged and unstaged
diff against `base_sha`. Inspect nearby source and failure-path tests. Read
[`COORDINATION.md`](../../packages/llm-core/internal/final-architecture/COORDINATION.md)
only when checking concurrency, review or integration procedure.

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
- Verify exact adapter versions, declared loss, direct dependencies and isolated
  fixtures. Publication must leave a durable, non-skipping registered qualifier.
- For `./client`, Metro evidence supports only the pinned React Native/Metro
  library window—not native modules or application lifecycle behavior.
- Enforce the 500-SLOC rule and every task-specific release/package gate.

Run focused and adjacent checks, then the task-required type, lint, package and
whitespace gates. Reject evidence polluted by overlapping writers or workspace
fallback.

Report each actionable `P0`–`P2` finding in its own copyable `md` block with
file/line, invariant, reproduction, impact and required correction. Put approval
and verification evidence in ordinary Markdown. The coordinator owns commit,
integration and final task/STATUS transition after approval.
