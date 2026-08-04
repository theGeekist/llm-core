# ADR-013 — Operational Qualification Boundaries

Architecture version: v2
Status: accepted
Date: 2026-08-01
Owners: architecture coordinator
Affected tasks: capabilities-context-qualification, capabilities-evaluation-qualification, capabilities-operational-evidence, runtime-receipt-reconciliation, runtime-temporal-reference, capabilities-workspace-sandbox, adapters-protocol-qualification, adapter-strands-runtime, adapter-strands-runtime-release
Supersedes: none

## Context

The core and language stages provide a small portable kernel: explicit
contracts, controlled tools, evidence, state lifetimes, context selections,
evaluation cases, and one local plus bounded Python runner proof. The
specification sequence is the immediate next implementation path.

The evidence across the 19 assessed repositories exposes a separate planning
need. No framework turns a context selection into authorization, a trace into
an audit ledger, a framework checkpoint into durable distributed execution, or
a local evaluator into independent release qualification. Several frameworks
also add workspaces, MCP/A2A, teams, hosted control planes, or pricing systems
as product-shaped surfaces. Those concerns must be planned without turning
`llm-core` into such a platform.

The source assessment is
`/Users/jasonnathan/Repos/aifsd-agent-framework-research/profiles/llm-core-support-assessment.md`,
with comparative evidence in `COMPARISON.md` and
`AIWORKS-CAPABILITY-MAP.md`.

## Decision

### Kernel ownership

- Keep `llm-core` a typed control and interoperability kernel. It owns
  portable facts, capability ports, conformance fixtures, and qualified
  adapters; it does not own a hosted control plane, pricing catalogue, audit
  store, approval service, vector store, durable-work service, or secret
  manager.
- No operational capability is added to the package root by default. New
  public adapter fronts require a dedicated coordinator-owned publication task
  with packed-package verification.
- Canonical execution events and evidence remain distinct from observability
  traces. A trace is correlation/projection data, never the evidence ledger.

### Context qualification

- `ContextSelection` remains an immutable statement of selected portable
  inputs. It does not prove that a caller may disclose a source, that the
  content is fresh, or that it is safe to place in a model prompt.
- A future extension `ContextCompiler` port must make eligibility explicit:
  source authorization and tenant/purpose scope, classification and redaction,
  freshness/applicability, precedence, prompt-injection risk treatment,
  deterministic budget allocation, and selection rationale/evidence.
- Retrieval, memory, and vector stores remain replaceable providers. Their
  records are neither a policy authority nor a portable `llm-core` memory
  format.

### Operational evidence and qualification

- A `UsageReceipt` records observed model usage together with the resolved
  model/profile identity, provider request identity when available, and an
  explicit attribution disposition. Currency conversion and price catalogues
  remain composition or service concerns; absent verified pricing must not
  mint a cost claim.
- An optional OpenTelemetry projection/export port maps redacted canonical
  events to spans/logs. It declares sampling, redaction, delivery and
  retention behavior and carries trace correlation without widening portable
  evidence payloads or adding an OpenTelemetry SDK dependency to the kernel.
- Evaluation qualification adds immutable dataset/split identity, slices,
  trajectory and safety assertions, uncertainty where a metric provides it,
  independent promotion decisions, and optimizer lineage. Optimization is not
  a release decision; candidates pass a held-out gate before promotion.

### Durable effects and runtime boundaries

- The current receipt journal continues to refuse blind re-execution of
  `started` or `indeterminate` effects. A reconciliation slice must add owner
  fencing, lease staleness policy, recovery evidence and explicit ambiguous
  outcome handling before a durable-runtime reference path is qualified.
- A first durable reference uses Temporal only behind the existing durable
  execution boundary. Model/tool work happens in idempotent activities;
  approvals and cancellation are signals or updates; replay, timers,
  restarts, and ambiguous external effects receive conformance fixtures.
  `llm-core` does not claim cross-runtime checkpoint portability or exactly
  once external effects.

### Workspace, protocol, and multi-agent boundaries

- A future `ExecutionWorkspace`/`SandboxExecutor` port declares process,
  filesystem, network, snapshot, restoration, cancellation, and effect-receipt
  semantics. It reports host execution as unsandboxed; it does not pretend to
  provision an isolation boundary.
- MCP tools and A2A peers are qualified adapters, not trusted shortcuts. MCP
  calls enter the controlled tool path; A2A keeps remote identity, state, and
  delegation semantics native until a supported mapping and loss report exist.
- Do not create a canonical `Team`, `Crew`, or handoff topology. Applications
  compose explicit `Workflow` and `AgentRunner` values; framework-specific
  delegation remains inside a qualified adapter with causal events and a
  documented loss model.

## Consequences

The specification sequence can begin immediately after the completed language
rollout. The operational qualification tasks are deliberately proposed work:
they neither block specification contracts nor authorize a broad framework
integration. They preserve the research roadmap as explicit, testable work
instead of letting it become accidental public surface area.

Each qualified runtime or protocol adapter declares exact framework/package
versions, supported operations, loss, cancellation, resume and upgrade
behavior. The first TypeScript runtime proof is Strands; later adapters remain
demand-led and use the same conformance gate.

## Rejected alternatives

- Add generic teams, crew roles, graph state, provider sessions, or checkpoint
  formats to the portable kernel.
- Treat OpenTelemetry, a local trace, or framework event history as immutable
  audit evidence.
- Claim a sandbox, data authorization, cost, or durable recovery guarantee
  merely because an adapter exposes a similarly named hook.
- Publish every protocol or runtime adapter through the root package entry.

## Verification implications

- Context tests must prove authorization/freshness/risk failure is explicit;
  the selection must preserve evidence and be immutable.
- Usage and trace projection tests must prove that redaction, sampling and
  delivery failure do not affect execution or create an unsupported cost claim.
- Durable reference fixtures must prove replay and crash/restart behavior
  without re-running recorded effects.
- Workspace, MCP, A2A and runtime adapters require versioned support matrices
  and explicit unsupported-semantics tests.

## Later extension

ADR-014 refines observed usage into separate estimate and reconciliation facts,
adds connector authorization/reliability boundaries, and places desktop/mobile
delivery over a shared client contract. It does not supersede this decision.
