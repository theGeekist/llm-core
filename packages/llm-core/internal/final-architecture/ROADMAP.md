# Architecture v2 Continuing Programmes

Architecture version: v2
Role: programme grouping and priority advice; task front matter owns lifecycle state
Kernel baseline: `9920425`
Boundary correction: ADR-016
Decision authority: [ADR-013](decisions/ADR-013-operational-qualification-boundaries.md), [ADR-015](decisions/ADR-015-kernel-completion-programme-boundaries.md), [ADR-016](decisions/ADR-016-integration-owned-execution.md)

`llm-core` is the portable contract, conformance, authority and evidence kernel
joining two complete use cases: AI-first software delivery and agentic behavior
inside the delivered product. It is not the executor for either use case.

The diagrams below express programme priority and dependencies, never task
status. Exact lifecycle, ownership and write scope live only in task front
matter.

## Admission

A task is selectable only when its dependencies and decisions are complete, its
boundary is justified, and its focused plus integration/publication checks are
explicit. Implemented, qualified, published and supported remain distinct.

Runtime support additionally requires:

- a concrete external runtime and exact upstream version;
- an adapter implementing `AgentRunner` without flattening native state;
- capability and information-loss reporting;
- isolated conformance evidence; and
- a maintenance owner and support window before publication.

The local TypeScript and fake runners are private test evidence and never
satisfy runtime publication admission.

## Boundary correction

```text
architecture-runtime-ownership-correction
  -> corrected public package surface
  -> corrected specification target boundary
  -> corrected runtime and delivery roadmap
```

The correction removes implicit local execution, marks every pre-v2 document
with a `v1-` prefix and supersedes client-first product sequencing. It does not
discard the valid control, evidence, authority, specification or conformance
work already in the kernel.

## Stable-waist qualification

```text
runtime-receipt-reconciliation
  -> runtime-tool-execution-decomposition
      -> runtime-tools-front-boundary

runtime-receipt-reconciliation
  -> runtime-temporal-reference

runtime-tools-front-boundary
  -> capabilities-workspace-sandbox

capabilities-operational-evidence
  -> cost-facts
      -> cost-budget-control
          -> cost-budget-enforcement

capabilities-evaluation-qualification + cost-facts
  -> model-routing-qualification
```

Temporal remains a durability integration, not the kernel's workflow engine.
Cost catalogues, exchange rates, invoices, credentials and hosted workers remain
host or integration concerns.

## Runtime integrations

```text
capabilities-runtime-conformance
+ capabilities-operational-evidence
+ architecture-release-reproducibility
  -> adapter-langgraph-runtime
  -> adapter-pydantic-ai-runtime
  -> adapter-strands-runtime

two qualified unlike runtime adapters
  -> runtime-adapter-substitution
```

LangGraph is the first TypeScript graph-runtime target because it directly
tests native graph, reducer, interrupt and checkpoint preservation. PydanticAI
is the first Python typed-runtime target and tests subprocess/sidecar or remote
integration. Strands remains an independently qualified runtime candidate.

`runtime-adapter-substitution` must run the same portable intent through two
unlike runtimes, compare normalized evidence and report semantic loss. It must
not claim checkpoint or native-session interchangeability.

Other runtimes—OpenAI Agents, Claude Agent SDK, OpenHands, Microsoft Agent
Framework, ADK, Mastra and others—are demand-led additions through the same
qualification path. Component adapters such as LangChain model/retrieval
bindings do not constitute runtime support.

## Specification and delivery integrations

```text
adapter-openspec       -> adapter-openspec-release       [preferred]
adapter-pydantic-ai   -> adapter-pydantic-ai-release    [specification only]
adapter-ai-sdlc       -> adapter-ai-sdlc-release        [demand]
adapter-spec-kit      -> adapter-spec-kit-release       [demand]
adapter-bmad          -> adapter-bmad-release           [demand]
```

Specification adapters import, reconcile or project intent. They are not
runners. In particular, the PydanticAI specification adapter is distinct from a
PydanticAI runtime adapter.

Publication names the exact contract/version, package window, maintenance
owner, deprecation policy and durable registered qualifier.

## AIFSD delivery product

```text
specification-api
+ adapter-openspec
+ capabilities-evaluation-qualification
+ capabilities-operational-evidence
+ adapter-coding-agent-integration
  -> aifsd-delivery-characterization
      -> aifsd-delivery-toolchain
```

The characterization must prove one complete governed change:

```text
understand repository and request
  -> reconcile accepted specification
  -> invoke a coding-agent integration
  -> run tests and evaluation
  -> perform independent review
  -> bind approval and evidence
  -> produce a release decision
```

The toolchain may become a separate SDK, CLI or application once executable
consumers establish its shape. It composes `llm-core`; it is not exported as a
kernel runtime. Codex, Claude Agent SDK and OpenHands are delivery/runtime
integration candidates, not behavior reimplemented in the kernel.

This delivery stream and runtime-adapter substitution are independent product
journeys. Delivery needs one qualified coding-agent integration; it does not
wait for interchangeable LangGraph/PydanticAI execution. Runtime substitution
can progress without defining the AIFSD SDK or CLI.

## Connectors and operating services

```text
runtime-tools-front-boundary
  -> integrations-connector-characterization
      -> integrations-connector-contracts
          -> integrations-authorization-lifecycle

runtime-receipt-reconciliation
+ capabilities-operational-evidence
+ integrations-authorization-lifecycle
  -> adapters-protocol-qualification
```

Connector characterization uses unlike executable MCP and OAuth SaaS slices.
Hosted approval inboxes, registries, credential brokers, sandboxes, context
compilers, telemetry stores and policy administration remain services above or
beside the kernel.

## Deferred client products

The former shared-client, desktop and mobile tasks are cancelled as current
programme commitments. They may be re-proposed only after:

1. one end-to-end AIFSD delivery characterization is complete;
2. two unlike runtime adapters pass substitution evidence; and
3. real operator journeys show that a shared client contract is needed.

This does not prohibit applications. It prevents an operator UI from becoming
the accidental product definition before the two underlying AIFSD use cases are
cohesive.

## Publication and package rules

```text
implemented -> qualified for an exact fixture set
            -> published and supported for an exact version/window
```

Subpaths remain the default. A separate package requires measured incompatible
peers/platforms, independent cadence/ownership, material build/install cost,
consumer upgrade demand or security/release pressure. An AIFSD SDK or CLI is
expected to become a separate artifact when it owns application orchestration
or an independent release lifecycle.

## Priority

1. Complete ADR-016 boundary correction and package-surface verification.
2. Finish stable-waist runtime/tool remediation.
3. Qualify real runtime integrations and one coding-agent delivery integration.
4. In independent streams, demonstrate runtime substitution and characterize
   one governed AIFSD delivery slice.
5. Derive an SDK, CLI or application from delivery evidence.
6. Reconsider desktop/mobile clients only from demonstrated operator demand.
