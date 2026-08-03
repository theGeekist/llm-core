# Internal Architecture Authority

The Markdown files prefixed with `v1-` are historical Architecture v1 design,
stage and implementation records. They describe the former recipe, local
runner, workflow and interaction product and are retained only as provenance.

They are **not requirements for current work**. Do not copy a v1 API, runtime
ownership rule or roadmap item into production or current planning unless an
accepted Architecture v2 ADR explicitly adopts it.

Current authority lives in [`final-architecture/`](final-architecture/):

- [`PLAN.md`](final-architecture/PLAN.md) records the accepted posture;
- [`decisions/`](final-architecture/decisions/) owns architectural decisions;
- [`ROADMAP.md`](final-architecture/ROADMAP.md) groups continuing programmes;
- [`tasks/`](final-architecture/tasks/) owns exact lifecycle and scope; and
- [`COORDINATION.md`](final-architecture/COORDINATION.md) owns execution rules.

ADR-016 is the explicit boundary between the v1 runnable product and the v2
AIFSD contract, conformance and evidence kernel.
