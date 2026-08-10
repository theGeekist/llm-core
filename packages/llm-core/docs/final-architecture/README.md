# llm-core Architecture v2

The v2 kernel is complete at `9920425`. Later qualification, integration, adapter and product work is independently prioritizable under ADR-015. ADR-017 is accepted and governs exact external-contract qualification.

## Document ownership

- [`PLAN.md`](PLAN.md): completed kernel posture and evidence.
- [`ROADMAP.md`](ROADMAP.md): continuing programme grouping, admission and priority advice.
- [`STATUS.md`](STATUS.md): generated task-state projection.
- [`COORDINATION.md`](COORDINATION.md): claim, concurrency, review and integration procedure.
- [`tasks/`](tasks/): authoritative task state, exact dependencies, scope and checks.
- [`decisions/`](decisions/): accepted architecture rationale.
- [`LANGUAGE.md`](LANGUAGE.md): completed public-language decisions.
- [`SPECIFICATIONS.md`](SPECIFICATIONS.md): specification model and interoperability seams.
- [`EXTERNAL-CONTRACT-FIDELITY-IMPACT.md`](EXTERNAL-CONTRACT-FIDELITY-IMPACT.md): code and task impact for accepted ADR-017.

Read only the documents needed for the current action. Planning uses ROADMAP; implementation/review starts from the selected task and named ADRs; COORDINATION is required for claims or integration; PLAN is historical.

The directory name `final-architecture` is historical. The explicit v2 marker and ADR-015 completion boundary are authoritative.
