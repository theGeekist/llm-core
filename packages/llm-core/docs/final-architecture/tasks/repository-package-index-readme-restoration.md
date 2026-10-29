---
id: repository-package-index-readme-restoration
title: Restore the repository package index README
stage: architecture
status: review
priority: normal
forward_to: []
depends_on: []
decision_dependencies: []
conflicts_with: []
write_scope:
  - README.md
  - packages/llm-core/docs/final-architecture/tasks/repository-package-index-readme-restoration.md
  - packages/llm-core/docs/final-architecture/STATUS.md
required_reading:
  - path: README.md
    reason: Preserve the committed package index and check that each repository-history pointer resolves.
  - path: packages/llm-core/README.md
    reason: Keep root package descriptions aligned with the package-owned adoption guide.
  - path: docs/reference/release-history.md
    reason: Use the existing repository release-history record for release claims instead of copied probe packets.
read_scope:
  - README.md
  - packages/llm-core/README.md
  - docs/reference/release-history.md
  - packages/llm-core/docs/final-architecture/tasks/README.md
  - packages/llm-core/docs/final-architecture/STATUS.md
  - packages/llm-core/docs/final-architecture/tasks/repository-package-index-readme-restoration.md
review_owner: coordinator
updated_at: 2026-10-29
---

# repository-package-index-readme-restoration: Restore the repository package index README

## Objective

Restore the root README as a useful package index while ensuring every repository-history reference resolves to maintained repository documentation or is clearly external.

## Why this exists

A dirty edit replaced the package index with a pinned-history note. Its links point to files absent from this checkout, and the note obscures the three packages and their ownership boundaries.

## In scope

- Restore useful package summaries, boundaries, capability pointers and adoption routes from the package index.
- Keep repository release-history claims linked to the maintained `docs/reference/release-history.md` record.
- Remove references to evidence files that are not part of this repository.
- Record this bounded correction in the native task authority and regenerate its STATUS projection.

## Out of scope

- Adding or copying research packets into the README or repository documentation.
- Editing the untracked `project-management-report.md` and `perceval-probe-receipt.json` packet copies at the repository root.
- Reconstructing Git history, changing package documentation, or modifying the public documentation site.
- Committing or pushing changes.

## Acceptance criteria

- The root README retains its useful package index and package ownership guidance.
- Every local Markdown link in the root README points to an existing path; any new history reference is a valid repository path or an explicit external URL.
- The root README does not link to the two untracked packet copies.
- The task brief is present and the generated architecture STATUS projection matches task front matter.
- Focused documentation and formatting checks are recorded with their actual results.

## Verification

- `PATH=/home/jasonjn/.bun/bin:$PATH bun run docs:check` — passed; verified 49 published pages, 172 package engineering pages, 6 routing pages, 23 embedded snippets, all sidebar links and snippet types.
- `/home/jasonjn/.bun/bin/bun node_modules/prettier/bin/prettier.cjs --check README.md packages/llm-core/docs/final-architecture/tasks/repository-package-index-readme-restoration.md` — passed.
- `/home/jasonjn/.bun/bin/bun run packages/llm-core/scripts/check-architecture-status.ts` — passed against 97 task briefs.
- A Node-based local-link scan of `README.md` — passed; every local Markdown target exists.
- `! rg -n -F -e 'project-management-report.md' -e 'perceval-probe-receipt.json' README.md` — passed; neither packet filename appears.
- `bun install --frozen-lockfile --no-progress` was attempted to repair ignored local dependencies but stalled without output and was interrupted; no successful install is claimed.

## Required evidence

- Changed paths and focused command results.
- Any dependency or environment blocker that prevents a check from completing.
- Confirmation that the two untracked packet copies were left untouched.

## Work log

Execution mode: shared-checkout
Execution rationale: The change is limited to the root README and its native task record in the selected checkout.
Concurrency evaluation: existing active tasks have disjoint source and adapter scopes; no concurrency needed for this documentation correction.
Concurrent task scopes: none
Swarm delegation: none

## Previous blocker

The earlier `docs:check` attempt was blocked by a missing `micromark-util-chunked` package in the ignored `node_modules` tree, and a frozen-lockfile install stalled. The current `docs:check` run passes with the installed dependencies.

## Handoff

### Result

The root README matches the committed package index again. Its release-history link targets maintained repository documentation, and all local Markdown links resolve. Awaiting review; the full docs checker now passes.

### Decisions applied

Use the repository's maintained release-history document as the history pointer. Do not embed research packet references in the package index.

### Files changed

- `packages/llm-core/docs/final-architecture/tasks/repository-package-index-readme-restoration.md`
- `packages/llm-core/docs/final-architecture/STATUS.md` (generated)

`README.md` is restored to its committed content and has no remaining diff.

### Verification evidence

The task-scoped Prettier check, local README link scan, architecture STATUS check and repository `docs:check` command passed. An earlier frozen install did not complete. Neither the lockfile nor packet copies were targeted.

### Deviations

The earlier `tg` command was absent from PATH. With the local Bun path set, `bun run tasks:plan` and `bun run tasks:context -- llm-core/repository-package-index-readme-restoration` now pass.

### Remaining risks

No task-scoped check remains blocked.

### Recommended next task

None.
