# llm-core Architecture v2 Status

Architecture version: v2
Updated: 31 July 2026
Active tasks: 1

This is a projection. Task files under [`tasks/`](tasks/) are authoritative.
Swarm claiming and integration follow [`COORDINATION.md`](COORDINATION.md).

| Task                             | Stage          | Status   | Planned swarm | Owner                     | Depends on                                                                                |
| -------------------------------- | -------------- | -------- | ------------- | ------------------------- | ----------------------------------------------------------------------------------------- |
| architecture-decisions           | architecture   | done     | coordinator   | architecture-coordinator  | —                                                                                         |
| api-baseline                     | baseline       | done     | historical    | Claude Code               | —                                                                                         |
| core-contracts                   | core           | done     | Codex         | codex-root                | architecture-decisions                                                                    |
| core-tool-control-events         | core           | done     | Codex         | codex-root                | core-contracts                                                                            |
| core-model-runtime               | core           | done     | historical    | Claude Code               | core-contracts                                                                            |
| core-state-interventions         | core           | done     | Codex         | codex-root                | core-tool-control-events                                                                  |
| core-agent-runner                | core           | done     | Codex         | codex-root                | core-tool-control-events, core-model-runtime, core-state-interventions                    |
| core-knowledge                   | core           | done     | Codex         | codex-root                | core-contracts, core-model-runtime, core-ai-sdk-adapter                                   |
| core-conversations               | core           | done     | Codex         | codex-root                | core-contracts, core-model-runtime, core-state-interventions, core-ai-sdk-adapter         |
| core-media-schemas-skills        | core           | done     | Codex         | codex-root                | core-contracts, core-model-runtime, core-agent-runner, core-ai-sdk-adapter                |
| core-capability-bindings         | core           | done     | Codex         | codex-root                | core-knowledge, core-conversations, core-media-schemas-skills                             |
| core-ai-sdk-packaging            | core           | done     | Codex         | codex-root                | core-tool-control-events, core-model-runtime                                              |
| core-ai-sdk-adapter              | core           | done     | Codex         | codex-root                | core-tool-control-events, core-model-runtime, core-ai-sdk-packaging                       |
| core-interactions                | core           | done     | Codex         | codex-root                | core-state-interventions, core-agent-runner, core-ai-sdk-adapter                          |
| core-convergence                 | core           | done     | coordinator   | codex-root                | api-baseline, core-capability-bindings, core-interactions                                 |
| capabilities-context-artifacts   | capabilities   | done     | Codex         | codex-context-artifacts   | core-convergence                                                                          |
| capabilities-evaluation          | capabilities   | done     | Codex         | codex-evaluation-domain   | core-convergence, capabilities-context-artifacts                                          |
| capabilities-runtime-conformance | capabilities   | done     | Codex         | codex-conformance-runtime | core-convergence, core-ai-sdk-adapter, core-interactions                                  |
| language-audit                   | language       | done     | coordinator   | codex-root                | capabilities-context-artifacts, capabilities-evaluation, capabilities-runtime-conformance |
| language-vocabulary              | language       | review   | coordinator   | codex-root                | language-audit, ADR-011                                                                   |
| language-rollout                 | language       | proposed | coordinator   | —                         | language-vocabulary, ADR-012                                                              |
| specification-contracts          | specifications | blocked  | coordinator   | —                         | language-rollout, ADR-009                                                                 |
| specification-compiler           | specifications | blocked  | coordinator   | —                         | specification-contracts                                                                   |
| specification-authority          | specifications | proposed | coordinator   | —                         | specification-compiler                                                                    |
| specification-api                | specifications | proposed | coordinator   | —                         | specification-authority                                                                   |
| adapter-openspec                 | adapters       | proposed | Codex         | —                         | specification-api                                                                         |
| adapter-openspec-release         | adapters       | proposed | coordinator   | —                         | adapter-openspec, ADR-010                                                                 |
| adapter-pydantic-ai              | adapters       | proposed | Codex         | —                         | specification-api                                                                         |
| adapter-pydantic-ai-release      | adapters       | proposed | coordinator   | —                         | adapter-pydantic-ai, ADR-010                                                              |
| adapter-ai-sdlc                  | adapters       | proposed | Codex         | —                         | specification-api                                                                         |
| adapter-ai-sdlc-release          | adapters       | proposed | coordinator   | —                         | adapter-ai-sdlc, ADR-010                                                                  |
| adapter-spec-kit                 | adapters       | proposed | Codex         | —                         | specification-api                                                                         |
| adapter-spec-kit-release         | adapters       | proposed | coordinator   | —                         | adapter-spec-kit, ADR-010                                                                 |
| adapter-bmad                     | adapters       | proposed | Codex         | —                         | specification-api                                                                         |
| adapter-bmad-release             | adapters       | proposed | coordinator   | —                         | adapter-bmad, ADR-010                                                                     |

## Next action

Review exact-vocabulary ADR-012, its 731-export classification and the five
desired common-journey fixtures. After ADR-012 is accepted and
`language-vocabulary` is marked done, `language-rollout` changes source,
package entrypoints, documentation and packed usability as one atomic
integration.
`specification-contracts` remains blocked until that task passes.

Pipeline 1.2.0 is published, pinned and packed-qualified.
`specification-compiler` now waits only for `specification-contracts`.
