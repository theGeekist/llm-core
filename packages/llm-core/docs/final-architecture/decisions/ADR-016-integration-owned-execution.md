# ADR-016 — Integration-Owned Execution and AIFSD Product Boundaries

Architecture version: v2
Status: accepted
Date: 2026-08-04
Owners: architecture coordinator
Affected tasks: architecture-runtime-ownership-correction, all runtime-adapter and product tasks
Supersedes: the local-runner implementation clause in ADR-006, the local-reference implementation clause in ADR-007, the runnable Agent/Workflow/Conversation journeys in ADR-012, and the client-product priority in ADR-014 and ADR-015

## Context

The pre-v2 package implemented recipes, a local model/tool loop, workflows and
interaction sessions. The AIFSD architecture subsequently separated AI-first
software delivery from agentic product runtime and repositioned `llm-core` as
the portable contract, conformance and evidence layer between those use cases
and native execution frameworks.

Architecture v2 retained the local TypeScript loop to prove the `AgentRunner`
contract. The public-language programme then exposed `createAgent`,
`defineWorkflow` and `createConversation` as ready-to-run common objects. In
practice `createAgent` selected `createLocalAgentRunner` implicitly, despite
ADR-012 stating that the local runner was not the implementation of the common
Agent journey. This made a conformance proof look like the canonical runtime
and prevented external runtime adapters from occupying the ordinary execution
path without losing native semantics.

## Decision

### Kernel ownership

`llm-core` owns portable contracts, authority, policy, evidence, provenance,
capability discovery, information-loss reporting and conformance. It does not
own a default agent loop, workflow engine, conversation executor, scheduler or
durable runtime.

`AgentRunner` is an integration-facing port. Supported runner implementations
are qualified runtime integrations such as LangGraph, PydanticAI, Strands,
OpenAI Agents, Microsoft Agent Framework, ADK or another explicitly qualified
runtime. Native graphs, sessions, checkpoints, controls, workspaces and event
payloads remain owned by those runtimes. They cross the kernel only as portable
envelopes or serialized opaque references that the owning integration resolves;
live framework objects never become compiled specification targets.

The existing local TypeScript implementation is retained only as private
conformance and regression evidence. It is not a supported package front, a
common application journey or an execution target for specification
compilation. A fake runner remains test infrastructure rather than a runtime
support claim.

### Public fronts

- The package root is contract- and specification-oriented. It does not export
  ready-to-run Agent, Workflow or Conversation factories.
- `./agent` exposes portable agent definitions, events and results.
- `./agent/runtime` exposes the runner port and extension-author contracts, but
  no concrete local runner.
- `./workflow` exposes portable workflow intent. Executable workflow behavior
  is supplied by runtime integrations.
- A conversation or interaction contract may describe portable state and
  events, but it must not select or conceal a concrete runner.
- Concrete runtimes are published through explicit adapter subpaths only after
  exact-version qualification and maintenance ownership are recorded.

### Specification compilation

Specification import never authorizes execution. Accepted intent compiles to
an explicit portable target supplied by a runtime or delivery integration. A
target is declarative JSON or a serialized opaque integration reference, never
a live native object. The kernel may define portable target contracts, but it
has no privileged built-in
`ExecutionPlan -> createAgent -> run` path.

The semantic specification waist must represent the connected AIFSD concepts
needed across delivery and product runtime—including application, agent, tool,
context, workflow, evaluation, approval and capability intent—without
reimplementing the native framework objects that execute them.

### Two product use cases

The architecture retains two complete and distinct journeys:

1. **AI-first software delivery:** understand, specify, build, review, evaluate,
   approve, produce evidence and release software.
2. **Agentic product runtime:** execute delivered agentic behavior through a
   qualified native runtime integration.

An AIFSD SDK, CLI, portal or application may compose the first journey above
`llm-core`; it is a delivery product, not kernel behavior. Desktop and mobile
operator clients are downstream product choices and do not precede proof of a
real delivery vertical slice and runtime substitution.

### Historical documents

All pre-v2 architecture documents at `packages/llm-core/docs/` use a `v1-`
filename prefix and are explicitly historical. They are useful provenance but
cannot supply requirements to v2 work unless an accepted v2 ADR adopts them.

## Consequences

- The common runnable facades and their package-root exports are removed rather
  than retained behind compatibility aliases.
- The local runner remains usable by internal conformance tests only.
- Runtime adapter qualification becomes the only path to a supported runner.
- Roadmap priority returns to the stable waist, real runtime adapters and one
  governed AIFSD delivery slice before desktop/mobile product foundations.
- ADR-012 remains authoritative for vocabulary that does not imply kernel-owned
  execution, including Tool and Specification language.

## Rejected alternatives

- Keep a convenient local default and permit applications to inject another
  runner later.
- Treat the local runner as one supported runtime adapter without isolated
  publication and qualification.
- Preserve runnable facades as deprecated aliases.
- Build desktop/mobile operator products before proving the two architectural
  use cases end to end.

## Naming and public API impact

The package root no longer exports runnable Agent, Workflow or Conversation
factories. `./agent/runtime` exposes runner contracts without a concrete local
runner, while `./agent` and `./workflow` expose portable definitions and
intent. Qualified runtimes use explicit adapter subpaths; no compatibility
aliases preserve the removed execution fronts.

## Serialization and compatibility impact

Compiled targets remain portable data or serialized opaque integration
references. Native runtime objects, checkpoints and sessions are neither
serialized as kernel contracts nor exchanged between adapters. The removal of
the runnable facades is intentionally breaking because the package has no
external compatibility obligation.

## Verification implications

Package qualification must prove that no supported export selects the local
runner, every published runtime adapter declares its exact upstream support,
and compiled specification targets contain no live framework objects. Internal
conformance tests continue to exercise the local proof without publishing it.

## Follow-up tasks

- `adapter-langgraph-runtime` and `adapter-pydantic-ai-runtime` qualify real,
  unlike runner integrations.
- `runtime-adapter-substitution` demonstrates portable intent across them.
- `aifsd-delivery-characterization` and `aifsd-delivery-toolchain` define the
  delivery product above the kernel.
- `architecture-test-sloc-decomposition` removes the temporary proof-suite
  waivers introduced by this correction.
