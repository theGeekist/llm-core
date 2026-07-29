# Claude Code Instructions

Read and follow [`AGENTS.md`](AGENTS.md) first.

The final-architecture implementation is coordinated through
[`packages/llm-core/internal/final-architecture/PLAN.md`](packages/llm-core/internal/final-architecture/PLAN.md).
Cross-swarm claiming, isolation, handoff, and integration follow
[`packages/llm-core/internal/final-architecture/COORDINATION.md`](packages/llm-core/internal/final-architecture/COORDINATION.md).

When assigned a task:

1. open its file under `packages/llm-core/internal/final-architecture/tasks/`;
2. verify its dependencies and decision dependencies are complete;
3. edit only its declared write scope;
4. update only that task file's ownership, status, work log and handoff;
5. stop for any undecided cross-cutting architecture question; and
6. leave root exports, package metadata, shared fixtures and legacy deletion to
   the integration task unless the brief explicitly grants them.

Do not self-assign a merely planned task. Wait until the coordinator has
populated its owner, worktree, branch, base SHA, and lease. Do not rebase,
merge, cherry-pick, or integrate task branches.

Conversation state is not project state. Another worker must be able to resume
from the task file, accepted ADRs, repository changes and verification evidence
alone.
