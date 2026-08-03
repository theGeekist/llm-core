# Architecture v2 Continuing Programmes

Architecture version: v2
Status: proposed work; no active task
Kernel baseline: `9920425`
Pre-transition source baseline: `c041792`
Decision authority: [ADR-013](decisions/ADR-013-operational-qualification-boundaries.md), [ADR-014](decisions/ADR-014-integration-cost-client-application-boundaries.md), [ADR-015](decisions/ADR-015-kernel-completion-programme-boundaries.md)

The kernel is complete. Qualification, Integrations, Adapters and Products are
independently prioritizable continuing programmes. They may not widen the root,
invent hosted dependencies or publish support merely because implementation
exists.

## Admission

A task becomes ready only when its dependencies and ADRs are complete, its
abstraction/boundary is justified, and its focused plus integration/publication
checks are explicit. Selection, concurrency and ownership follow
[`COORDINATION.md`](COORDINATION.md). The diagrams show programme-specific
sequencing, not every cross-cutting gate; task front matter is the sole exact
dependency graph.

## Immediate remediation

```text
architecture-decisions
  -> architecture-source-layout-normalization

architecture-source-layout-normalization
  -> every other proposed code-producing task below

runtime-receipt-reconciliation (done)
  -> runtime-tool-execution-decomposition
      -> runtime-tools-front-boundary

architecture-source-layout-normalization
  -> architecture-release-reproducibility
  -> architecture-status-validation

language-rollout (done) + architecture-source-layout-normalization
  -> architecture-legacy-functional-removal
```

The first task flattens classification-only adapter nesting and enforces source
names before other work can spread the old layout. The remaining tasks
decompose controlled execution, remove the tooling upward import, freeze
release qualification, validate STATUS and delete the retired functional alias.

## Qualification

```text
runtime-receipt-reconciliation (done)
  -> runtime-temporal-reference

runtime-tools-front-boundary
  -> capabilities-workspace-sandbox

capabilities-operational-evidence (done)
  -> cost-facts
      -> cost-budget-control
          -> cost-budget-enforcement

capabilities-evaluation-qualification (done) + cost-facts
  -> model-routing-qualification

capabilities-operational-evidence (done)
+ capabilities-runtime-conformance (done)
  -> adapter-strands-runtime
      -> adapter-strands-runtime-release
```

Cost facts, budget decisions, mandatory gateway enforcement and advisory routing
are separate. Price catalogues, exchange rates, invoices and billing remain host
services. External runtimes use exact direct dependencies and isolated fixtures.

## Integrations

```text
language-rollout (done) + runtime-tools-front-boundary
  -> integrations-connector-characterization
      -> integrations-connector-contracts
          -> integrations-authorization-lifecycle

runtime-receipt-reconciliation (done)
+ capabilities-operational-evidence (done)
+ integrations-authorization-lifecycle
  -> adapters-protocol-qualification
```

Connector characterization uses independent executable MCP and OAuth SaaS
slices. They share no provisional connector base. A2A remains separately typed.

## Specification adapters

```text
adapter-openspec (done)       -> adapter-openspec-release       [preferred]
adapter-pydantic-ai (done)    -> adapter-pydantic-ai-release    [preferred]
adapter-ai-sdlc (done)        -> adapter-ai-sdlc-release        [demand]
adapter-spec-kit (done)       -> adapter-spec-kit-release       [demand]
adapter-bmad (done)           -> adapter-bmad-release           [demand]
```

All releases depend on `architecture-release-reproducibility`, run serially and
name an owner, exact contract/version, package window, deprecation policy and
durable registered qualifier.

## Products

```text
specification-api (done)
+ integrations-authorization-lifecycle
+ cost-facts
+ cost-budget-enforcement
+ model-routing-qualification
  -> applications-client-characterization
      -> applications-client-contract
          -> applications-client-platform-qualification
              -> applications-client-subpath-release

applications-client-subpath-release
  -> applications-desktop
  -> applications-mobile
```

The shared client is derived from independent desktop/mobile and
local/fake-remote journeys, then implemented privately in `llm-core`. Publication
requires the final tarball to pass isolated Node, browser and pinned React
Native/Metro consumers and registers that qualifier for later releases. Native
modules and application lifecycle remain product concerns.

## Publication and package rules

```text
implemented -> qualified for an exact fixture set
            -> published and supported for an exact version/window
```

Subpaths remain the default. A separate package requires measured incompatible
peers/platforms, independent cadence/ownership, material build/install cost,
consumer upgrade demand or security/release pressure. Subpath count alone is not
a trigger.

## Priority

When work resumes: complete source-layout normalization, then the runtime
boundary remediation; publish OpenSpec
and PydanticAI only if support is desired; characterize connectors before their
contract; implement cost facts before budget/routing; defer client and platform
work until their dependency gates pass. This is advice, not an active claim.
