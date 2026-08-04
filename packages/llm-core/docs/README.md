# llm-core package documents

This directory owns `llm-core` engineering documentation: current architecture,
task coordination, accepted decisions, and retained historical design records.
The shared public VitePress site remains at the repository-root [`docs/`](../../../docs/).

## Architecture authority

Files prefixed with `v1-` are historical Architecture v1 design, stage and
implementation records retained only as provenance. They are **not requirements
for current work**; an accepted Architecture v2 ADR must explicitly adopt any
v1 API, runtime ownership rule or roadmap item before reuse.

Current authority lives in [`final-architecture/`](final-architecture/):

- [`PLAN.md`](final-architecture/PLAN.md) records the accepted posture;
- [`decisions/`](final-architecture/decisions/) owns architectural decisions;
- [`ROADMAP.md`](final-architecture/ROADMAP.md) groups continuing programmes;
- [`tasks/`](final-architecture/tasks/) owns exact lifecycle and scope; and
- [`COORDINATION.md`](final-architecture/COORDINATION.md) owns execution rules.

Conversation routing and review context live in [`handoffs/`](handoffs/).
They point back to task front matter rather than duplicating live task state.

The package-specific [`v1-changelog.md`](v1-changelog.md) is provenance, not a
current release plan.

ADR-016 is the explicit boundary between the retired v1 runnable product and
the current `llm-core` contract, conformance, authority and evidence kernel.
