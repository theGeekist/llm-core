# Project Guidance

## Authoritative workspace

- The canonical coordination checkout for this project is
  `/Users/jasonnathan/Repos/@theGeekist/llm-core`.
- Before inspecting, editing, testing, or reporting status, run
  `git rev-parse --show-toplevel` and require that exact path unless the
  selected task's front matter explicitly names a dedicated worktree.
- Treat `.worktrees/**`, sibling repositories, attachments, research folders,
  and copied source trees as context only. Do not edit them or use their state
  as project evidence unless the selected task explicitly names that exact
  checkout and grants its paths in `write_scope`.
- Never select a workspace because a broad search found a similarly named file.
  Resolve the task brief from this checkout first, then use its recorded
  `worktree` path when one is active.
- Before starting the next candidate task, inspect `git status` and every task
  currently active. Compare that candidate's conflicts, write scope, generated
  outputs, and staging paths with the ongoing work in real time. Selection is
  incremental, with no preset serial or parallel preference. Use the primary
  checkout by default; serialize or repartition overlaps. A dedicated worktree
  is a last resort for otherwise-disjoint work whose risk, bulk, or final
  evidence genuinely requires isolation.

## Git workflow

- Use trunk-based development on `main`.
- Start work from an up-to-date, clean `main`.
- Do not create or switch to a feature branch unless the user explicitly asks for one.
- Keep changes focused and reviewable. Do not commit, push, publish, or release unless explicitly requested.

## Package ownership

- Read the repository [`README.md`](README.md) for the ecosystem package index,
  then read the selected package's `README.md` before using package-specific
  plans or documentation.
- The repository-root `docs/` tree is the aggregated public VitePress site. It
  presents package adoption material, but it does not own package engineering
  authority or task state.
- Resolve the package being changed before reading package-specific plans or
  documentation. Package roots are `packages/<package-name>/`.
- Each package owns its `README.md`, engineering `docs/`, source, tests, and
  package-specific architecture or task material. For example, `llm-core`
  architecture lives in `packages/llm-core/docs/final-architecture/`. Resolve
  the equivalent location from the selected package instead of assuming
  `llm-core` paths apply everywhere.
- Package-owned documentation internals live under
  `packages/<package-name>/docs/internal/`; do not create `.internal` document
  directories or place package engineering material under the public site.
- AIFSD implementation, tests, public code validators, and package metadata
  remain in `packages/aifsd/` so changes that require `llm-core` support can be
  made atomically in this monorepo. Its private architecture and task authority
  live in the private research repository and may be mounted locally at
  `packages/aifsd/docs`; that mount is ignored, untracked, and optional. Public
  builds and checks must work when it is absent.
- Use the selected package's README, nearest `AGENTS.md` when present, and
  package-owned documentation. Except for the explicit AIFSD private-authority
  boundary above, do not place package-specific planning in a sibling package,
  research repository, attachment, or copied tree.
- When shared tooling accepts a package path, pass the selected package
  explicitly. Root convenience commands may aggregate packages, but must not
  obscure which package owns the underlying material.

## Task context

- Before selecting or claiming architecture work, run
  `bun run tasks:plan --authority all` from the canonical checkout.
- After selecting a task, run
  `bun run tasks:context -- <authority>/<task-id>` and open every generated
  governing, historical, decision and dependency item before implementation or
  review. A generated context pack is an index, not evidence that its files
  were read.
- `required_reading` is an ordered task-specific obligation for historical,
  caveat and evidence material. `read_scope` is additional inspection
  authority, not a substitute for required reading.
- External repositories required by tasks are exposed through ignored local
  symlinks under `context/`, currently `context/aifsd-research` and
  `context/simple-chat`. Tasks reference those mounted paths. If a required
  mount is unavailable, restore or configure it; never drop the context or
  narrow `required_reading` merely to satisfy the current `read_scope`.
- Apply the current backend or frontend slice architecture skill whenever the
  selected work touches that surface. Skills guide the work but are not
  repository architecture authority and must not be listed in task
  `required_reading`.

## Task completion cadence

- Treat the first coherent implementation with focused tests and package type
  checks passing as the review-ready threshold. Do not postpone independent
  review until documentation, aggregate repository gates, release
  qualification or receiving evidence are complete.
- When the user requests an independent review, spawn the reviewer immediately
  after that focused-green threshold. Run slow external or exact-version gates
  in parallel with review when they do not mutate overlapping state.
- Keep the coordinator on the critical path. Delegate bounded review,
  qualification or diagnostic work, but do not create overlapping broad
  audits. Stop auxiliary investigations after they answer their assigned
  question.
- Run focused checks while implementing. After review fixes, send the same
  reviewer through the current diff and run one final task-focused gate set.
  Do not repeat unchanged broad gates after every small edit.
- Run root-wide, release-wide and private-corpus gates only when the selected
  task explicitly requires them or focused evidence shows a plausible
  repository-wide interaction. Record unrelated failures as external blockers;
  do not pull them onto the current task's critical path.
- Do not monitor, review, qualify or repair another active task while the
  selected task is incomplete unless the user explicitly orders that work or
  an immediate shared-path decision is required. Once the shared-path decision
  is made, return to the selected task.
- For host-sensitive or container qualification, perform one diagnostic rerun
  after a failure, fix from the returned evidence, then rerun only the affected
  gate. Avoid speculative full-suite reruns.
- Keep lifecycle and handoff evidence current, but update it after substantive
  implementation and review milestones rather than interleaving documentation
  edits with every code change.
- A task is ready when its scoped acceptance evidence passes, the independent
  reviewer reports no actionable findings on the final diff, and known
  unrelated dirty-state failures are clearly separated. Commit, push,
  publication and review of other tasks remain separate user-authorised steps.

## Internationalisation and configuration cadence

- Treat internationalisation and runtime configuration as normal concerns when
  a feature, application surface or adapter is introduced or materially
  changed, even when there is currently one locale or one deployment profile.
- Keep user-facing strings identifiable and owned by the feature that
  introduces them. Keep machine identifiers, protocol values, reason codes and
  serialized contracts language-neutral; render prose at the delivery edge.
- Resolve locale and configuration sources at application composition. Provide
  features and adapters with explicit values rather than reading process or
  host state from domain code.
- Record new configuration requirements in the owning task and documentation
  when the feature is touched. Prefer portable primitives where practical,
  without turning one library family into package doctrine.
- Keep locale-sensitive presentation such as dates, numbers, currencies and
  lists outside portable facts and protocol records.

## Compatibility policy

- The project is pre-user and pre-compatibility. Optimize for the final coherent design rather than preserving legacy APIs, overloads, aliases, deprecated paths, serialized shapes, or behaviors from earlier versions.
- Do not add compatibility shims, deprecation bridges, legacy fallbacks, dual signatures, or version migration code unless the user explicitly requests them.
- Prefer replacing an inferior public API outright and updating every repository call site, test, example, and document in the same change.
- Treat current external ecosystem contracts as integration requirements, but do not confuse them with compatibility obligations for this package's own historical API.
- When reviewing or refactoring, explicitly identify simplifications that become possible because backward compatibility is not required.

## Functional architecture

- Preserve the codebase's point-free style where it improves composition and keeps data flow clear.
- Prefer `compose` and Kleisli `composeK` over adding `pipe` or `pipeK` aliases. Do not introduce a pipeline combinator solely to reverse reading order.
- Preserve `MaybePromise` and its monadic combinators as a core sync-or-async abstraction. Do not normalize the architecture to always-async `Promise` flows.
- Prefer genuinely composed, curried, data-last transformations over manually rebuilding context records between consecutive `maybeChain(bindFirst(...))` calls.
- Composition does not imply eliminating every context object or intermediate type. Keep them when they carry real domain meaning, improve type safety, or make state transitions explicit.
- Consolidate the functional basis only when usage evidence supports it; avoid parallel currying or composition helpers with no distinct purpose.

## Refactoring guidance

- Verify call sites and behavior before accepting repository-wide metrics or simplification claims.
- Prioritize high-leverage composition opportunities in workflow run/resume paths and interaction step execution.
- Treat boilerplate reduction as orthogonal to functional style. Review repeated recipe definitions, runtime wrappers, diagnostic factories, comparators, run/stream variants, reducer branches, and identity getters for evidence-backed consolidation.
- Preserve intended domain behavior, `MaybePromise` semantics, streaming, pause/resume/rollback, and current external adapter contracts. Historical package behavior is not a compatibility constraint.
- Refactor incrementally with focused tests that demonstrate equivalence.

## Source organization

- Follow the canonical layout and size rules in
  `packages/llm-core/docs/final-architecture/COORDINATION.md` when working on
  `llm-core`; use the selected package's corresponding authority for other
  packages.
- Prefer `src/<layer>/<capability-or-integration>/<descriptive-file>` and
  kebab-case filenames. Use prefixes instead of classificatory subfolders;
  deeper production paths require a real independently owned boundary.
- Use `public.ts` for internal architectural fronts and `index.ts` only for
  package or published-subpath entrypoints. Do not add vague `common`, `misc`,
  `shared`, `utils`, or generic `helpers` modules.
- Treat roughly 500 physical source lines as the target for new hand-written
  production and test modules. Files from 501 through 600 lines require a
  lightweight waiver whose complete justification may simply be
  `approximately 500 lines`; reviewers must not require decomposition or a
  follow-up task on size alone. Files above 600 lines cross the hard boundary
  and follow the stronger digest/waiver rule in the coordination document.
