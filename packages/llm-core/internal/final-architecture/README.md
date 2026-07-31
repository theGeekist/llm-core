# llm-core Architecture v2

This directory is the canonical Architecture v2 programme for `llm-core`.
It replaces the historical stage plans and v1 public posture with the accepted
narrow-waist contracts, capability slices, control kernel, application
orchestration, specification compilation, and qualified adapter boundaries
defined here.

The `final-architecture` path is retained while active task branches converge;
the explicit v2 marker is authoritative. Every ADR and task created from the
templates in this directory belongs to Architecture v2 unless a later
superseding architecture version says otherwise.

- [`PLAN.md`](PLAN.md) defines the target posture and implementation stages.
- [`STATUS.md`](STATUS.md) projects current task state.
- [`COORDINATION.md`](COORDINATION.md) defines deterministic swarm execution.
- [`LANGUAGE.md`](LANGUAGE.md) records the complete public-language audit,
  journey contracts and language rollout gate.
- [`SPECIFICATIONS.md`](SPECIFICATIONS.md) defines the specification model,
  eight interoperability seams and Pipeline adoption gates.
- [`decisions/ADR-013`](decisions/ADR-013-operational-qualification-boundaries.md)
  records the post-language qualification boundary for operational evidence,
  durable recovery, context safety, workspaces and protocol adapters.
- [`decisions/ADR-014`](decisions/ADR-014-integration-cost-client-application-boundaries.md)
  defines connector authorization, cost intelligence and the shared-client,
  desktop and mobile product boundary.
- [`decisions/`](decisions/) contains accepted Architecture v2 ADRs.
- [`tasks/`](tasks/) contains Architecture v2 implementation briefs.
