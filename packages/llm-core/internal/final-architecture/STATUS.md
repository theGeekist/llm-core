# llm-core Architecture v2 Status

Architecture version: v2
Updated: 4 August 2026
Kernel: complete at `9920425`
Pre-transition source baseline: `c041792`

<!-- architecture-status:generated:start -->

Active tasks: 1

This is a human projection. Task front matter under [`tasks/`](tasks/) is
authoritative and will be mechanically checked by
`architecture-status-validation`. Claims and integration follow
[`COORDINATION.md`](COORDINATION.md).

## Kernel baseline

The v2 kernel is complete. Its six stages contain 25 completed tasks:

| Stage          | Done | Terminal task or evidence |
| -------------- | ---: | ------------------------- |
| Architecture   |    1 | `architecture-decisions`  |
| Baseline       |    1 | `api-baseline`            |
| Core           |   13 | `core-convergence`        |
| Capabilities   |    3 | capability convergence    |
| Language       |    3 | `language-rollout`        |
| Specifications |    4 | `specification-api`       |

The original completion surface contained 30 ESM runtime and declaration
entrypoints. ADR-016 corrects it to 29 by removing the kernel-owned workflow
runtime front and runnable root facades. The package retains packed-qualified
`@wpkernel/pipeline@1.2.0` as mechanical composition substrate.

## Active boundary correction

| Task                                      | Stage        | Status | Depends on             |
| ----------------------------------------- | ------------ | ------ | ---------------------- |
| architecture-runtime-ownership-correction | architecture | review | architecture-decisions |

### Kernel task inventory

| Task                             | Stage          | Status | Depends on                                                                                                                                                       |
| -------------------------------- | -------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| architecture-decisions           | architecture   | done   | —                                                                                                                                                                |
| api-baseline                     | baseline       | done   | —                                                                                                                                                                |
| core-contracts                   | core           | done   | architecture-decisions                                                                                                                                           |
| core-tool-control-events         | core           | done   | core-contracts                                                                                                                                                   |
| core-model-runtime               | core           | done   | core-contracts                                                                                                                                                   |
| core-state-interventions         | core           | done   | core-tool-control-events                                                                                                                                         |
| core-agent-runner                | core           | done   | core-tool-control-events, core-model-runtime, core-state-interventions                                                                                           |
| core-ai-sdk-packaging            | core           | done   | core-tool-control-events, core-model-runtime                                                                                                                     |
| core-ai-sdk-adapter              | core           | done   | core-tool-control-events, core-model-runtime, core-ai-sdk-packaging                                                                                              |
| core-knowledge                   | core           | done   | core-contracts, core-model-runtime, core-ai-sdk-adapter                                                                                                          |
| core-conversations               | core           | done   | core-contracts, core-model-runtime, core-state-interventions, core-ai-sdk-adapter                                                                                |
| core-media-schemas-skills        | core           | done   | core-contracts, core-model-runtime, core-agent-runner, core-ai-sdk-adapter                                                                                       |
| core-capability-bindings         | core           | done   | core-tool-control-events, core-state-interventions, core-agent-runner, core-knowledge, core-conversations, core-media-schemas-skills                             |
| core-interactions                | core           | done   | core-state-interventions, core-agent-runner, core-ai-sdk-adapter                                                                                                 |
| core-convergence                 | core           | done   | api-baseline, core-agent-runner, core-knowledge, core-conversations, core-media-schemas-skills, core-capability-bindings, core-ai-sdk-adapter, core-interactions |
| capabilities-context-artifacts   | capabilities   | done   | core-convergence                                                                                                                                                 |
| capabilities-evaluation          | capabilities   | done   | core-convergence, capabilities-context-artifacts                                                                                                                 |
| capabilities-runtime-conformance | capabilities   | done   | core-convergence, core-ai-sdk-adapter, core-interactions                                                                                                         |
| language-audit                   | language       | done   | capabilities-context-artifacts, capabilities-evaluation, capabilities-runtime-conformance                                                                        |
| language-vocabulary              | language       | done   | language-audit                                                                                                                                                   |
| language-rollout                 | language       | done   | language-vocabulary                                                                                                                                              |
| specification-contracts          | specifications | done   | language-rollout                                                                                                                                                 |
| specification-compiler           | specifications | done   | specification-contracts                                                                                                                                          |
| specification-authority          | specifications | done   | specification-compiler                                                                                                                                           |
| specification-api                | specifications | done   | specification-authority                                                                                                                                          |

## Completed continuing evidence

| Task                                  | Stage         | Status | Depends on                                                           | Evidence milestone |
| ------------------------------------- | ------------- | ------ | -------------------------------------------------------------------- | ------------------ |
| capabilities-context-qualification    | qualification | done   | language-rollout                                                     | pre-completion     |
| capabilities-evaluation-qualification | qualification | done   | capabilities-evaluation, language-rollout                            | pre-completion     |
| capabilities-operational-evidence     | qualification | done   | language-rollout                                                     | pre-completion     |
| runtime-receipt-reconciliation        | qualification | done   | core-tool-control-events, core-state-interventions, language-rollout | `bb7f7f7`          |
| adapter-openspec                      | adapters      | done   | specification-api                                                    | `cf3347d`          |
| adapter-pydantic-ai                   | adapters      | done   | specification-api                                                    | `cf3347d`          |
| adapter-ai-sdlc                       | adapters      | done   | specification-api                                                    | `cf3347d`          |
| adapter-spec-kit                      | adapters      | done   | specification-api                                                    | `cf3347d`          |
| adapter-bmad                          | adapters      | done   | specification-api                                                    | `cf3347d`          |

“Done” for an adapter implementation means internally qualified. It does not
mean published or supported through a package front.

## Proposed continuing work

| Task                                     | Stage         | Status   | Depends on                                                                                                                                                                                     |
| ---------------------------------------- | ------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| architecture-source-layout-normalization | architecture  | done     | architecture-decisions                                                                                                                                                                         |
| architecture-status-validation           | architecture  | proposed | architecture-decisions, architecture-source-layout-normalization                                                                                                                               |
| architecture-release-reproducibility     | architecture  | done     | architecture-decisions, architecture-source-layout-normalization                                                                                                                               |
| architecture-legacy-functional-removal   | architecture  | proposed | architecture-source-layout-normalization, language-rollout                                                                                                                                     |
| runtime-tool-execution-decomposition     | qualification | done     | architecture-source-layout-normalization, runtime-receipt-reconciliation                                                                                                                       |
| runtime-tools-front-boundary             | qualification | proposed | architecture-source-layout-normalization, runtime-tool-execution-decomposition                                                                                                                 |
| runtime-temporal-reference               | qualification | proposed | architecture-source-layout-normalization, runtime-receipt-reconciliation, capabilities-runtime-conformance, architecture-release-reproducibility                                               |
| capabilities-workspace-sandbox           | qualification | proposed | architecture-source-layout-normalization, runtime-receipt-reconciliation, runtime-tools-front-boundary                                                                                         |
| cost-facts                               | qualification | proposed | architecture-source-layout-normalization, capabilities-operational-evidence                                                                                                                    |
| cost-budget-control                      | qualification | proposed | architecture-source-layout-normalization, cost-facts, runtime-receipt-reconciliation                                                                                                           |
| cost-budget-enforcement                  | qualification | proposed | architecture-source-layout-normalization, cost-budget-control, runtime-tools-front-boundary                                                                                                    |
| model-routing-qualification              | qualification | proposed | architecture-source-layout-normalization, cost-facts, capabilities-evaluation-qualification                                                                                                    |
| integrations-connector-characterization  | integrations  | proposed | architecture-source-layout-normalization, language-rollout, runtime-tools-front-boundary                                                                                                       |
| integrations-connector-contracts         | integrations  | proposed | architecture-source-layout-normalization, integrations-connector-characterization                                                                                                              |
| integrations-authorization-lifecycle     | integrations  | proposed | architecture-source-layout-normalization, integrations-connector-contracts                                                                                                                     |
| adapters-protocol-qualification          | adapters      | proposed | architecture-source-layout-normalization, runtime-receipt-reconciliation, capabilities-operational-evidence, integrations-authorization-lifecycle, architecture-release-reproducibility        |
| adapter-strands-runtime                  | adapters      | proposed | architecture-runtime-ownership-correction, architecture-source-layout-normalization, capabilities-operational-evidence, capabilities-runtime-conformance, architecture-release-reproducibility |
| adapter-strands-runtime-release          | adapters      | proposed | architecture-runtime-ownership-correction, architecture-source-layout-normalization, adapter-strands-runtime                                                                                   |
| adapter-langgraph-runtime                | adapters      | proposed | architecture-runtime-ownership-correction, architecture-release-reproducibility, capabilities-runtime-conformance, capabilities-operational-evidence                                           |
| adapter-pydantic-ai-runtime              | adapters      | proposed | architecture-runtime-ownership-correction, architecture-release-reproducibility, capabilities-runtime-conformance, capabilities-operational-evidence                                           |
| runtime-adapter-substitution             | qualification | proposed | adapter-langgraph-runtime, adapter-pydantic-ai-runtime                                                                                                                                         |
| adapter-coding-agent-integration         | adapters      | proposed | architecture-runtime-ownership-correction, capabilities-runtime-conformance, capabilities-operational-evidence                                                                                 |
| aifsd-delivery-characterization          | applications  | proposed | architecture-runtime-ownership-correction, adapter-openspec, adapter-coding-agent-integration, capabilities-evaluation-qualification, capabilities-operational-evidence                        |
| aifsd-delivery-toolchain                 | applications  | proposed | aifsd-delivery-characterization                                                                                                                                                                |
| adapter-openspec-release                 | adapters      | proposed | architecture-source-layout-normalization, adapter-openspec, architecture-release-reproducibility                                                                                               |
| adapter-pydantic-ai-release              | adapters      | proposed | architecture-source-layout-normalization, adapter-pydantic-ai, architecture-release-reproducibility                                                                                            |
| adapter-ai-sdlc-release                  | adapters      | proposed | architecture-source-layout-normalization, adapter-ai-sdlc, architecture-release-reproducibility                                                                                                |
| adapter-spec-kit-release                 | adapters      | proposed | architecture-source-layout-normalization, adapter-spec-kit, architecture-release-reproducibility                                                                                               |
| adapter-bmad-release                     | adapters      | proposed | architecture-source-layout-normalization, adapter-bmad, architecture-release-reproducibility                                                                                                   |

## Cancelled work

| Task                                       | Stage         | Status    | Depends on                                                                                                                                                                             | Replacement                                                                                   |
| ------------------------------------------ | ------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| capabilities-cost-intelligence             | qualification | cancelled | capabilities-operational-evidence, capabilities-evaluation-qualification                                                                                                               | `cost-facts`, `cost-budget-control`, `cost-budget-enforcement`, `model-routing-qualification` |
| applications-client-characterization       | applications  | cancelled | architecture-source-layout-normalization, specification-api, integrations-authorization-lifecycle, cost-facts, cost-budget-enforcement, model-routing-qualification                    | `aifsd-delivery-characterization`                                                             |
| applications-client-contract               | applications  | cancelled | architecture-source-layout-normalization, applications-client-characterization, integrations-authorization-lifecycle, cost-facts, cost-budget-enforcement, model-routing-qualification | `aifsd-delivery-toolchain`                                                                    |
| applications-client-platform-qualification | applications  | cancelled | architecture-source-layout-normalization, applications-client-contract, architecture-release-reproducibility                                                                           | `aifsd-delivery-toolchain`                                                                    |
| applications-client-subpath-release        | applications  | cancelled | architecture-source-layout-normalization, applications-client-platform-qualification                                                                                                   | `aifsd-delivery-toolchain`                                                                    |
| applications-desktop                       | applications  | cancelled | architecture-source-layout-normalization, applications-client-subpath-release                                                                                                          | `aifsd-delivery-characterization`                                                             |
| applications-mobile                        | applications  | cancelled | architecture-source-layout-normalization, applications-client-subpath-release                                                                                                          | `aifsd-delivery-characterization`                                                             |

The cancelled brief is retained as historical planning provenance. No
implementation was started under it.

<!-- architecture-status:generated:end -->

## Resume recommendation

After the ADR-016 correction is accepted, the recommended sequence is:

```text
architecture-source-layout-normalization
  -> runtime-tool-execution-decomposition
      -> runtime-tools-front-boundary

capabilities-runtime-conformance
  -> adapter-langgraph-runtime
  -> adapter-pydantic-ai-runtime
      -> runtime-adapter-substitution

adapter-coding-agent-integration
  -> aifsd-delivery-characterization
      -> aifsd-delivery-toolchain
```

The runtime-substitution and AIFSD-delivery chains are independent. Neither is
a prerequisite for the other; they share the corrected kernel contracts, not
product orchestration.

`architecture-status-validation` is independently selectable. It shares root
metadata with other architecture tasks, so execute overlapping ownership
serially in the primary checkout; a worktree would not cure that overlap.
Connector work begins with characterization, not contract implementation.
Desktop and mobile work remains cancelled until delivery and runtime evidence
demonstrates the product need. See [`ROADMAP.md`](ROADMAP.md).
