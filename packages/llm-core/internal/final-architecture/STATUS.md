# llm-core Architecture v2 Status

Architecture version: v2
Updated: 3 August 2026
Kernel: complete at `9920425`
Pre-transition source baseline: `c041792`

<!-- architecture-status:generated:start -->

Active tasks: 0

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

The completion surface contains 30 ESM runtime and declaration entrypoints and
pins packed-qualified `@wpkernel/pipeline@1.2.0`. Continuing work does not
reopen this completion claim.

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

No task is active in the shared canonical checkout.

| Task                                       | Stage         | Status   | Depends on                                                                                                                                                                              |
| ------------------------------------------ | ------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| architecture-source-layout-normalization   | architecture  | done     | architecture-decisions                                                                                                                                                                  |
| architecture-status-validation             | architecture  | proposed | architecture-decisions, architecture-source-layout-normalization                                                                                                                        |
| architecture-release-reproducibility       | architecture  | proposed | architecture-decisions, architecture-source-layout-normalization                                                                                                                        |
| architecture-legacy-functional-removal     | architecture  | proposed | architecture-source-layout-normalization, language-rollout                                                                                                                              |
| runtime-tool-execution-decomposition       | qualification | proposed | architecture-source-layout-normalization, runtime-receipt-reconciliation                                                                                                                |
| runtime-tools-front-boundary               | qualification | proposed | architecture-source-layout-normalization, runtime-tool-execution-decomposition                                                                                                          |
| runtime-temporal-reference                 | qualification | proposed | architecture-source-layout-normalization, runtime-receipt-reconciliation, capabilities-runtime-conformance, architecture-release-reproducibility                                        |
| capabilities-workspace-sandbox             | qualification | proposed | architecture-source-layout-normalization, runtime-receipt-reconciliation, runtime-tools-front-boundary                                                                                  |
| cost-facts                                 | qualification | proposed | architecture-source-layout-normalization, capabilities-operational-evidence                                                                                                             |
| cost-budget-control                        | qualification | proposed | architecture-source-layout-normalization, cost-facts, runtime-receipt-reconciliation                                                                                                    |
| cost-budget-enforcement                    | qualification | proposed | architecture-source-layout-normalization, cost-budget-control, runtime-tools-front-boundary                                                                                             |
| model-routing-qualification                | qualification | proposed | architecture-source-layout-normalization, cost-facts, capabilities-evaluation-qualification                                                                                             |
| integrations-connector-characterization    | integrations  | proposed | architecture-source-layout-normalization, language-rollout, runtime-tools-front-boundary                                                                                                |
| integrations-connector-contracts           | integrations  | proposed | architecture-source-layout-normalization, integrations-connector-characterization                                                                                                       |
| integrations-authorization-lifecycle       | integrations  | proposed | architecture-source-layout-normalization, integrations-connector-contracts                                                                                                              |
| adapters-protocol-qualification            | adapters      | proposed | architecture-source-layout-normalization, runtime-receipt-reconciliation, capabilities-operational-evidence, integrations-authorization-lifecycle, architecture-release-reproducibility |
| adapter-strands-runtime                    | adapters      | proposed | architecture-source-layout-normalization, capabilities-operational-evidence, capabilities-runtime-conformance, architecture-release-reproducibility                                     |
| adapter-strands-runtime-release            | adapters      | proposed | architecture-source-layout-normalization, adapter-strands-runtime                                                                                                                       |
| adapter-openspec-release                   | adapters      | proposed | architecture-source-layout-normalization, adapter-openspec, architecture-release-reproducibility                                                                                        |
| adapter-pydantic-ai-release                | adapters      | proposed | architecture-source-layout-normalization, adapter-pydantic-ai, architecture-release-reproducibility                                                                                     |
| adapter-ai-sdlc-release                    | adapters      | proposed | architecture-source-layout-normalization, adapter-ai-sdlc, architecture-release-reproducibility                                                                                         |
| adapter-spec-kit-release                   | adapters      | proposed | architecture-source-layout-normalization, adapter-spec-kit, architecture-release-reproducibility                                                                                        |
| adapter-bmad-release                       | adapters      | proposed | architecture-source-layout-normalization, adapter-bmad, architecture-release-reproducibility                                                                                            |
| applications-client-characterization       | applications  | proposed | architecture-source-layout-normalization, specification-api, integrations-authorization-lifecycle, cost-facts, cost-budget-enforcement, model-routing-qualification                     |
| applications-client-contract               | applications  | proposed | architecture-source-layout-normalization, applications-client-characterization, integrations-authorization-lifecycle, cost-facts, cost-budget-enforcement, model-routing-qualification  |
| applications-client-platform-qualification | applications  | proposed | architecture-source-layout-normalization, applications-client-contract, architecture-release-reproducibility                                                                            |
| applications-client-subpath-release        | applications  | proposed | architecture-source-layout-normalization, applications-client-platform-qualification                                                                                                    |
| applications-desktop                       | applications  | proposed | architecture-source-layout-normalization, applications-client-subpath-release                                                                                                           |
| applications-mobile                        | applications  | proposed | architecture-source-layout-normalization, applications-client-subpath-release                                                                                                           |

## Cancelled work

| Task                           | Stage         | Status    | Depends on                                                               | Replacement                                                                                   |
| ------------------------------ | ------------- | --------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| capabilities-cost-intelligence | qualification | cancelled | capabilities-operational-evidence, capabilities-evaluation-qualification | `cost-facts`, `cost-budget-control`, `cost-budget-enforcement`, `model-routing-qualification` |

The cancelled brief is retained as historical planning provenance. No
implementation was started under it.

<!-- architecture-status:generated:end -->

## Resume recommendation

The repository is intentionally paused. When the coordinator resumes work, the
first gate and recommended runtime sequence are:

```text
architecture-source-layout-normalization
  -> runtime-tool-execution-decomposition
      -> runtime-tools-front-boundary
```

`architecture-release-reproducibility` and `architecture-status-validation`
are independently selectable but share root metadata, so execute them serially
in the primary checkout; a worktree would not cure their overlapping ownership.
Connector work begins with characterization, not contract implementation.
OpenSpec and PydanticAI publication may be selected independently if the user
wants those public support commitments now. See [`ROADMAP.md`](ROADMAP.md).
