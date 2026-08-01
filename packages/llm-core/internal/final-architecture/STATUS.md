# llm-core Architecture v2 Status

Architecture version: v2
Updated: 1 August 2026
Active tasks: 2

This is a projection. Task files under [`tasks/`](tasks/) are authoritative.
Swarm claiming and integration follow [`COORDINATION.md`](COORDINATION.md).

| Task                                  | Stage          | Status      | Planned swarm | Owner                          | Depends on                                                                                                                |
| ------------------------------------- | -------------- | ----------- | ------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| architecture-decisions                | architecture   | done        | coordinator   | architecture-coordinator       | —                                                                                                                         |
| api-baseline                          | baseline       | done        | historical    | Claude Code                    | —                                                                                                                         |
| core-contracts                        | core           | done        | Codex         | codex-root                     | architecture-decisions                                                                                                    |
| core-tool-control-events              | core           | done        | Codex         | codex-root                     | core-contracts                                                                                                            |
| core-model-runtime                    | core           | done        | historical    | Claude Code                    | core-contracts                                                                                                            |
| core-state-interventions              | core           | done        | Codex         | codex-root                     | core-tool-control-events                                                                                                  |
| core-agent-runner                     | core           | done        | Codex         | codex-root                     | core-tool-control-events, core-model-runtime, core-state-interventions                                                    |
| core-knowledge                        | core           | done        | Codex         | codex-root                     | core-contracts, core-model-runtime, core-ai-sdk-adapter                                                                   |
| core-conversations                    | core           | done        | Codex         | codex-root                     | core-contracts, core-model-runtime, core-state-interventions, core-ai-sdk-adapter                                         |
| core-media-schemas-skills             | core           | done        | Codex         | codex-root                     | core-contracts, core-model-runtime, core-agent-runner, core-ai-sdk-adapter                                                |
| core-capability-bindings              | core           | done        | Codex         | codex-root                     | core-knowledge, core-conversations, core-media-schemas-skills                                                             |
| core-ai-sdk-packaging                 | core           | done        | Codex         | codex-root                     | core-tool-control-events, core-model-runtime                                                                              |
| core-ai-sdk-adapter                   | core           | done        | Codex         | codex-root                     | core-tool-control-events, core-model-runtime, core-ai-sdk-packaging                                                       |
| core-interactions                     | core           | done        | Codex         | codex-root                     | core-state-interventions, core-agent-runner, core-ai-sdk-adapter                                                          |
| core-convergence                      | core           | done        | coordinator   | codex-root                     | api-baseline, core-capability-bindings, core-interactions                                                                 |
| capabilities-context-artifacts        | capabilities   | done        | Codex         | codex-context-artifacts        | core-convergence                                                                                                          |
| capabilities-evaluation               | capabilities   | done        | Codex         | codex-evaluation-domain        | core-convergence, capabilities-context-artifacts                                                                          |
| capabilities-runtime-conformance      | capabilities   | done        | Codex         | codex-conformance-runtime      | core-convergence, core-ai-sdk-adapter, core-interactions                                                                  |
| language-audit                        | language       | done        | coordinator   | codex-root                     | capabilities-context-artifacts, capabilities-evaluation, capabilities-runtime-conformance                                 |
| language-vocabulary                   | language       | done        | coordinator   | codex-root                     | language-audit, ADR-011                                                                                                   |
| language-rollout                      | language       | done        | coordinator   | codex-root                     | language-vocabulary, ADR-012                                                                                              |
| specification-contracts               | specifications | done        | coordinator   | codex-specification-contracts  | language-rollout, ADR-009                                                                                                 |
| specification-compiler                | specifications | done        | coordinator   | codex-specification-compiler   | specification-contracts                                                                                                   |
| specification-authority               | specifications | done        | coordinator   | codex-root                     | specification-compiler                                                                                                    |
| specification-api                     | specifications | in_progress | coordinator   | codex-root                     | specification-authority                                                                                                   |
| adapter-openspec                      | adapters       | proposed    | Codex         | —                              | specification-api                                                                                                         |
| adapter-openspec-release              | adapters       | proposed    | coordinator   | —                              | adapter-openspec, ADR-010                                                                                                 |
| adapter-pydantic-ai                   | adapters       | proposed    | Codex         | —                              | specification-api                                                                                                         |
| adapter-pydantic-ai-release           | adapters       | proposed    | coordinator   | —                              | adapter-pydantic-ai, ADR-010                                                                                              |
| adapter-ai-sdlc                       | adapters       | proposed    | Codex         | —                              | specification-api                                                                                                         |
| adapter-ai-sdlc-release               | adapters       | proposed    | coordinator   | —                              | adapter-ai-sdlc, ADR-010                                                                                                  |
| adapter-spec-kit                      | adapters       | proposed    | Codex         | —                              | specification-api                                                                                                         |
| adapter-spec-kit-release              | adapters       | proposed    | coordinator   | —                              | adapter-spec-kit, ADR-010                                                                                                 |
| adapter-bmad                          | adapters       | proposed    | Codex         | —                              | specification-api                                                                                                         |
| adapter-bmad-release                  | adapters       | proposed    | coordinator   | —                              | adapter-bmad, ADR-010                                                                                                     |
| capabilities-context-qualification    | qualification  | done        | Codex         | codex-context-qualification    | language-rollout, ADR-013                                                                                                 |
| capabilities-evaluation-qualification | qualification  | done        | Codex         | codex-evaluation-qualification | capabilities-evaluation, language-rollout, ADR-013                                                                        |
| capabilities-operational-evidence     | qualification  | claimed     | Codex         | codex-operational-evidence     | language-rollout, ADR-013                                                                                                 |
| runtime-receipt-reconciliation        | qualification  | proposed    | Codex         | —                              | core-tool-control-events, core-state-interventions, language-rollout, ADR-013                                             |
| runtime-temporal-reference            | qualification  | proposed    | Codex         | —                              | runtime-receipt-reconciliation, capabilities-runtime-conformance, ADR-013                                                 |
| capabilities-workspace-sandbox        | qualification  | proposed    | Codex         | —                              | runtime-receipt-reconciliation, ADR-013                                                                                   |
| adapters-protocol-qualification       | adapters       | proposed    | Codex         | —                              | runtime-receipt-reconciliation, capabilities-operational-evidence, integrations-authorization-lifecycle, ADR-013, ADR-014 |
| adapter-strands-runtime               | adapters       | proposed    | Codex         | —                              | capabilities-operational-evidence, capabilities-runtime-conformance, ADR-013                                              |
| adapter-strands-runtime-release       | adapters       | proposed    | coordinator   | —                              | adapter-strands-runtime, ADR-013                                                                                          |
| integrations-connector-contracts      | integrations   | proposed    | Codex         | —                              | language-rollout, ADR-014                                                                                                 |
| integrations-authorization-lifecycle  | integrations   | proposed    | Codex         | —                              | integrations-connector-contracts, ADR-014                                                                                 |
| capabilities-cost-intelligence        | qualification  | proposed    | Codex         | —                              | capabilities-operational-evidence, capabilities-evaluation-qualification, ADR-014                                         |
| applications-client-contract          | applications   | proposed    | Codex         | —                              | specification-api, integrations-authorization-lifecycle, capabilities-cost-intelligence                                   |
| applications-desktop                  | applications   | proposed    | Codex         | —                              | applications-client-contract, ADR-014                                                                                     |
| applications-mobile                   | applications   | proposed    | Codex         | —                              | applications-client-contract, ADR-014                                                                                     |

## Next action

Implement `capabilities-operational-evidence` on `main`. The separate coding
agent owns the specification sequence; this task establishes usage receipts and
failure-isolated observability projection without overlapping it.

Pipeline 1.2.0 is published, pinned and packed-qualified. The
`specification-authority` is complete at `a1b4191`; `specification-api` is
addressing review feedback on `main`.
