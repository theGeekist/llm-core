---
id: publish-delivery-architecture-alignment
title: Publish the delivery architecture and task-context alignment
stage: architecture
status: review
priority: normal
forward_to: []
depends_on: []
decision_dependencies: []
conflicts_with: []
write_scope:
  - AGENTS.md
  - .gitignore
  - scripts/check-sloc.ts
  - scripts/check-sloc-mounts.test.ts
  - scripts/sloc-baseline.json
  - .taskgraph/project.json
  - task-graph.project.json
  - packages/llm-core/docs/final-architecture/tasks/task-graph-native-agent-runtime-migration-qualification.md
  - packages/llm-core/docs/final-architecture/tasks/publish-delivery-architecture-alignment.md
  - packages/llm-core/docs/final-architecture/STATUS.md
required_reading:
  - path: packages/llm-core/docs/final-architecture/tasks/task-graph-native-agent-runtime-migration-qualification.md
    reason: Preserve the pending runtime qualification and the corrected AIFSD scoring boundary.
  - path: .taskgraph/project.json
    reason: Preserve native context resolution and the explicit TaskGraph reading mount.
  - path: .gitignore
    reason: Keep separately committed Site checkouts outside the library source tree.
read_scope:
  - AGENTS.md
  - .gitignore
  - .taskgraph/project.json
  - task-graph.project.json
  - packages/llm-core/docs/final-architecture/tasks/task-graph-native-agent-runtime-migration-qualification.md
  - packages/llm-core/docs/final-architecture/**
  - .husky/**
  - scripts/quality/**
review_owner: coordinator
updated_at: 2026-11-03
---

# Publish the delivery architecture and task-context alignment

## Objective

Publish the existing llm-core documentation and task-context corrections in a
reviewable PR, with a recorded task association and a clean checkout.

## Why this exists

The delivery reconciliation left reviewed direction and context changes only
in the working copy. Jason requested commits and PRs for all outstanding work,
with no dirty files left behind. Publication must preserve the pending runtime
qualification rather than present the documentation correction as implementation.

## Scope

Include the parallel-work guidance, reconciled with the latest no-worktree instructions, the TaskGraph external
reading mount in both consumed configurations, and the migration brief's corrected ownership and qualification
language. Keep the separate, already committed Project Pulse Site checkout out
of this library's source inventory and SLOC walk. Regenerate the task-state projection for
this publication record. No runtime, score calculation or product implementation
changes belong to this task.

## Acceptance criteria

- The PR contains only the declared documentation, configuration and task-state
  paths, and links this task and the migration brief.
- Native plan/context, architecture status and required local Git checks pass;
  any unrelated failure is reported with its exact evidence.
- Independent review has no remaining actionable findings before publication.
- The branch is pushed, the PR is ready for review, and both this checkout and
  the separate Pulse Site checkout have clean Git status.
- Migration qualification remains proposed; a commit or PR does not establish
  runtime conformance, human acceptance, merge or release.

## Work log

Execution mode: shared-checkout.
Execution rationale: preserve the selected checkout and all existing changes;
no worktree is needed. Base: origin/main at 31270de.
Concurrency evaluation: Core Brain, Simple Chat and TaskGraph publication
workers own separate repository and Git-index scopes. Existing llm-core active
implementation tasks are not modified by this documentation publication.
Swarm delegation: coordinator owns this package; bounded independent review
will be recorded before commit. Task association is retrospective for earlier
documentation edits and direct for this publication work.

## Verification and handoff

Native task plan/context, architecture-status generation and verification,
documentation checks and the staged whitespace check passed on 1 November 2026.
Independent reviewer `commit_task_graph` reported no actionable findings on the
seven-file documentation/configuration change, including both context consumers,
the current workspace policy, ownership boundaries and pending qualification.

The commit and push hooks remain mandatory publication gates. The ready-for-review
PR will link this task and record their result; human acceptance and merge remain
separate. Keep remaining runtime and AIFSD qualification with their existing tasks.

On 3 November 2026, the pre-push gate found a 705-line file in the ignored
`.site-project-pulse` checkout. The gate's own directory walk did not respect
Git ignore rules. The follow-up excludes this separate local Site directory in
the canonical SLOC policy and baseline, with a focused regression test. The
four mount tests and `bun run check:sloc` passed after the fix. The other
quality stages passed before SLOC; the full required pre-push gate is pending.
