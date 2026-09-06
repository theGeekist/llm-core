# llm-core Architecture v2 Status

Architecture version: v2
Updated: 29 August 2026
Kernel: complete at `9920425`
Pre-transition source baseline: `c041792`

<!-- architecture-status:generated:start -->

Active tasks: 2

## Task inventory

<!-- prettier-ignore -->
| Task | Stage | Status | Dependencies | Evidence milestone | Replaced by | Forward to |
| --- | --- | --- | --- | --- | --- | --- |
| adapter-ai-sdk-native-contract-correction | adapters | done | architecture-external-contract-fidelity, core-ai-sdk-adapter | — | — | — |
| adapter-ai-sdlc | adapters | done | specification-api | cf3347d | — | — |
| adapter-ai-sdlc-release | adapters | proposed | architecture-source-layout-normalization, adapter-ai-sdlc, specification-cross-adapter-conformance, architecture-release-reproducibility | — | — | — |
| adapter-antigravity-cli-hooks-runtime | adapters | review | native-agent-conversation-runtime-contract | — | — | — |
| adapter-antigravity-desktop-sidecar-runtime | adapters | review | native-agent-conversation-runtime-contract | — | — | — |
| adapter-bmad | adapters | done | specification-api | cf3347d | — | — |
| adapter-bmad-release | adapters | proposed | architecture-source-layout-normalization, adapter-bmad, specification-cross-adapter-conformance, architecture-release-reproducibility | — | — | — |
| adapter-catalogue-public-qualification | adapters | done | architecture-external-contract-fidelity, architecture-release-reproducibility | — | — | — |
| adapter-claude-native-session-runtime | adapters | done | native-agent-conversation-runtime-contract | — | — | — |
| adapter-codex-app-server-runtime | adapters | done | native-agent-conversation-runtime-contract | — | — | — |
| adapter-codex-desktop-hooks-runtime | adapters | done | native-agent-conversation-runtime-contract | — | — | — |
| adapter-coding-agent-integration | adapters | done | architecture-external-contract-fidelity, architecture-runtime-ownership-correction, capabilities-runtime-conformance, capabilities-operational-evidence | — | — | — |
| adapter-langgraph-runtime | adapters | done | architecture-external-contract-fidelity, architecture-runtime-ownership-correction, runtime-operation-contract-correction, architecture-release-reproducibility, capabilities-runtime-conformance, capabilities-operational-evidence | — | — | — |
| adapter-openspec | adapters | done | specification-api | cf3347d | — | — |
| adapter-openspec-release | adapters | proposed | architecture-source-layout-normalization, adapter-openspec, specification-cross-adapter-conformance, architecture-release-reproducibility | — | — | — |
| adapter-pydantic-ai | adapters | done | specification-api | cf3347d | — | — |
| adapter-pydantic-ai-release | adapters | proposed | architecture-source-layout-normalization, adapter-pydantic-ai, adapter-pydantic-ai-semantic-projection, specification-cross-adapter-conformance, architecture-release-reproducibility | — | — | — |
| adapter-pydantic-ai-runtime | adapters | proposed | architecture-external-contract-fidelity, architecture-runtime-ownership-correction, runtime-operation-contract-correction, architecture-release-reproducibility, capabilities-runtime-conformance, capabilities-operational-evidence | — | — | — |
| adapter-pydantic-ai-semantic-projection | adapters | proposed | adapter-pydantic-ai, specification-exact-operation-contracts, specification-semantic-reconciliation | — | — | — |
| adapter-spec-kit | adapters | done | specification-api | cf3347d | — | — |
| adapter-spec-kit-release | adapters | proposed | architecture-source-layout-normalization, adapter-spec-kit, specification-cross-adapter-conformance, architecture-release-reproducibility | — | — | — |
| adapter-strands-runtime | adapters | proposed | architecture-external-contract-fidelity, architecture-runtime-ownership-correction, runtime-operation-contract-correction, architecture-source-layout-normalization, capabilities-operational-evidence, capabilities-runtime-conformance, architecture-release-reproducibility | — | — | — |
| adapter-strands-runtime-release | adapters | proposed | architecture-external-contract-fidelity, architecture-runtime-ownership-correction, runtime-operation-contract-correction, architecture-source-layout-normalization, adapter-strands-runtime | — | — | — |
| adapters-protocol-qualification | adapters | done | architecture-external-contract-fidelity, runtime-operation-contract-correction, architecture-source-layout-normalization, runtime-receipt-reconciliation, capabilities-operational-evidence, architecture-release-reproducibility, runtime-tools-front-boundary | — | — | — |
| aifsd-delivery-characterization | applications | cancelled | architecture-runtime-ownership-correction, adapter-openspec, adapter-coding-agent-integration, capabilities-evaluation-qualification, capabilities-operational-evidence | — | — | aifsd/local-delivery-vertical-slice |
| aifsd-delivery-toolchain | applications | cancelled | aifsd-delivery-characterization | — | — | aifsd/local-delivery-vertical-slice |
| api-baseline | baseline | done | — | — | — | — |
| applications-client-characterization | applications | cancelled | architecture-source-layout-normalization, specification-api, integrations-authorization-lifecycle, cost-facts, cost-budget-enforcement, model-routing-qualification | — | — | aifsd/clients-desktop-mobile-characterization |
| applications-client-contract | applications | cancelled | architecture-source-layout-normalization, applications-client-characterization, integrations-authorization-lifecycle, cost-facts, cost-budget-enforcement, model-routing-qualification | — | — | aifsd/clients-shared-work-control-contract |
| applications-client-platform-qualification | applications | cancelled | architecture-source-layout-normalization, applications-client-contract, architecture-release-reproducibility | — | — | aifsd/clients-platform-qualification |
| applications-client-subpath-release | applications | cancelled | architecture-source-layout-normalization, applications-client-platform-qualification | — | — | aifsd/clients-surface-publication |
| applications-desktop | applications | cancelled | architecture-source-layout-normalization, applications-client-subpath-release | — | — | aifsd/clients-desktop-foundation |
| applications-mobile | applications | cancelled | architecture-source-layout-normalization, applications-client-subpath-release | — | — | aifsd/clients-mobile-foundation |
| architecture-adapter-sloc-decomposition | architecture | proposed | architecture-source-layout-normalization | — | — | — |
| architecture-decisions | architecture | done | — | — | — | — |
| architecture-external-contract-fidelity | architecture | done | architecture-runtime-ownership-correction | — | — | — |
| architecture-legacy-functional-removal | architecture | done | architecture-source-layout-normalization, language-rollout | — | — | — |
| architecture-release-reproducibility | architecture | done | architecture-decisions, architecture-source-layout-normalization | — | — | — |
| architecture-runtime-ownership-correction | architecture | done | architecture-decisions | — | — | — |
| architecture-source-layout-normalization | architecture | done | architecture-decisions | — | — | — |
| architecture-status-validation | architecture | done | architecture-decisions, architecture-source-layout-normalization | — | — | — |
| architecture-test-sloc-decomposition | architecture | done | architecture-runtime-ownership-correction | — | — | — |
| capabilities-context-artifacts | capabilities | done | core-convergence | — | — | — |
| capabilities-context-qualification | qualification | done | language-rollout | pre-completion | — | — |
| capabilities-cost-intelligence | qualification | cancelled | capabilities-operational-evidence, capabilities-evaluation-qualification | — | — | cost-facts, cost-budget-control, cost-budget-enforcement, model-routing-qualification |
| capabilities-evaluation | capabilities | done | core-convergence, capabilities-context-artifacts | — | — | — |
| capabilities-evaluation-qualification | qualification | done | capabilities-evaluation, language-rollout | pre-completion | — | — |
| capabilities-operational-evidence | qualification | done | language-rollout | pre-completion | — | — |
| capabilities-runtime-conformance | capabilities | done | core-convergence, core-ai-sdk-adapter, core-interactions | — | — | — |
| capabilities-workspace-sandbox | qualification | proposed | architecture-source-layout-normalization, runtime-receipt-reconciliation, runtime-tools-front-boundary | — | — | — |
| core-agent-runner | core | done | core-tool-control-events, core-model-runtime, core-state-interventions | — | — | — |
| core-ai-sdk-adapter | core | done | core-tool-control-events, core-model-runtime, core-ai-sdk-packaging | — | — | — |
| core-ai-sdk-packaging | core | done | core-tool-control-events, core-model-runtime | — | — | — |
| core-capability-bindings | core | done | core-tool-control-events, core-state-interventions, core-agent-runner, core-knowledge, core-conversations, core-media-schemas-skills | — | — | — |
| core-contracts | core | done | architecture-decisions | — | — | — |
| core-convergence | core | done | api-baseline, core-agent-runner, core-knowledge, core-conversations, core-media-schemas-skills, core-capability-bindings, core-ai-sdk-adapter, core-interactions | — | — | — |
| core-conversations | core | done | core-contracts, core-model-runtime, core-state-interventions, core-ai-sdk-adapter | — | — | — |
| core-interactions | core | done | core-state-interventions, core-agent-runner, core-ai-sdk-adapter | — | — | — |
| core-knowledge | core | done | core-contracts, core-model-runtime, core-ai-sdk-adapter | — | — | — |
| core-media-schemas-skills | core | done | core-contracts, core-model-runtime, core-agent-runner, core-ai-sdk-adapter | — | — | — |
| core-model-runtime | core | done | core-contracts | — | — | — |
| core-state-interventions | core | done | core-tool-control-events | — | — | — |
| core-tool-control-events | core | done | core-contracts | — | — | — |
| cost-budget-control | qualification | proposed | architecture-source-layout-normalization, cost-facts, runtime-receipt-reconciliation | — | — | — |
| cost-budget-enforcement | qualification | proposed | architecture-source-layout-normalization, cost-budget-control, runtime-tools-front-boundary | — | — | — |
| cost-facts | qualification | done | architecture-source-layout-normalization, capabilities-operational-evidence | — | — | — |
| integrations-authorization-lifecycle | integrations | proposed | architecture-source-layout-normalization, integrations-connector-contracts | — | — | — |
| integrations-connector-characterization | integrations | done | architecture-external-contract-fidelity, architecture-source-layout-normalization, language-rollout, adapters-protocol-qualification | — | — | — |
| integrations-connector-contracts | integrations | proposed | architecture-external-contract-fidelity, architecture-source-layout-normalization, integrations-connector-characterization | — | — | — |
| kernel-aifsd-public-front-language | language | done | language-rollout, integrations-connector-characterization | — | — | — |
| language-audit | language | done | capabilities-context-artifacts, capabilities-evaluation, capabilities-runtime-conformance | — | — | — |
| language-rollout | language | done | language-vocabulary | — | — | — |
| language-vocabulary | language | done | language-audit | — | — | — |
| model-routing-qualification | qualification | proposed | architecture-source-layout-normalization, cost-facts, capabilities-evaluation-qualification | — | — | — |
| native-agent-conversation-runtime-contract | integrations | done | architecture-runtime-ownership-correction, core-agent-runner, core-interactions | — | — | — |
| native-agent-cross-provider-conformance | qualification | proposed | adapter-codex-app-server-runtime, adapter-codex-desktop-hooks-runtime, adapter-claude-native-session-runtime, adapter-antigravity-cli-hooks-runtime, adapter-antigravity-desktop-sidecar-runtime | — | — | — |
| native-agent-runtime-governance-reconciliation | architecture | done | — | — | — | — |
| production-quality-gates | qualification | done | — | — | — | — |
| release-history-provenance | qualification | done | release-v2-readiness | — | — | — |
| release-v2-readiness | architecture | done | architecture-release-reproducibility, adapters-protocol-qualification | — | — | — |
| runtime-adapter-substitution | qualification | proposed | architecture-external-contract-fidelity, runtime-operation-contract-correction, adapter-langgraph-runtime, adapter-pydantic-ai-runtime | — | — | — |
| runtime-operation-contract-correction | adapters | done | architecture-external-contract-fidelity, capabilities-runtime-conformance | — | — | — |
| runtime-receipt-reconciliation | qualification | done | core-tool-control-events, core-state-interventions, language-rollout | bb7f7f7 | — | — |
| runtime-temporal-reference | qualification | proposed | architecture-external-contract-fidelity, runtime-operation-contract-correction, architecture-source-layout-normalization, runtime-receipt-reconciliation, capabilities-runtime-conformance, architecture-release-reproducibility | — | — | — |
| runtime-tool-execution-decomposition | qualification | done | architecture-source-layout-normalization, runtime-receipt-reconciliation | — | — | — |
| runtime-tools-front-boundary | qualification | done | architecture-source-layout-normalization, runtime-tool-execution-decomposition | — | — | — |
| specification-api | specifications | done | specification-authority | — | — | — |
| specification-authority | specifications | done | specification-compiler | — | — | — |
| specification-compiler | specifications | done | specification-contracts | — | — | — |
| specification-contracts | specifications | done | language-rollout | — | — | — |
| specification-cross-adapter-conformance | qualification | proposed | architecture-external-contract-fidelity, specification-semantic-reconciliation, adapter-pydantic-ai-semantic-projection, adapter-openspec, adapter-ai-sdlc, adapter-spec-kit, adapter-bmad | — | — | — |
| specification-exact-operation-contracts | specifications | done | architecture-external-contract-fidelity, specification-api | — | — | — |
| specification-semantic-path-characterization | specifications | proposed | architecture-external-contract-fidelity, architecture-runtime-ownership-correction, specification-api, adapter-openspec, adapter-pydantic-ai, adapter-ai-sdlc, adapter-spec-kit, adapter-bmad | — | — | — |
| specification-semantic-reconciliation | specifications | proposed | specification-exact-operation-contracts, specification-semantic-path-characterization | — | — | — |
| task-graph-native-agent-runtime-migration-qualification | qualification | proposed | native-agent-cross-provider-conformance | — | — | — |

<!-- architecture-status:generated:end -->

## Selection guidance

Select continuing work from current task front matter after checking dependency
state, conflicts, active scopes, and write ownership. Use [`ROADMAP.md`](ROADMAP.md)
for programme grouping and priority advice; do not copy a fixed readiness
sequence into this projection.

AIFSD now has committed private product authority and a public `@aifsd/sdk`
workspace. Cancelled llm-core product tasks name exact AIFSD replacements;
`llm-core` retains kernel and integration prerequisites only.
