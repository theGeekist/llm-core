# ADR-015 — Kernel Completion and Continuing Programme Boundaries

Architecture version: v2
Status: accepted
Date: 2026-08-02
Owners: architecture coordinator
Affected tasks: all post-kernel remediation and continuing-programme tasks
Supersedes: none

## Context

Architecture v2 completed its architecture, baseline, core, capabilities,
language and specification stages. Treating every later qualification,
ecosystem or product idea as unfinished kernel work would make completion
recede indefinitely and blur the portable kernel with products built above it.

Review also found three pressures: controlled execution had become oversized;
the tooling feature imported upward into application orchestration; and shared
connector, cost and client contracts were being designed before unlike
consumers proved their common shape.

## Decision

### Completion and programmes

- The Architecture v2 kernel is complete at `9920425` with its 30-entry package
  baseline.
- New root exports are denied by default. Qualified extension fronts require a
  coordinator-owned publication decision.
- Continuing work is split into Qualification, Integrations, Adapters and
  Products. [`ROADMAP.md`](../ROADMAP.md) owns their grouping, admission and
  priority advice; task front matter owns the exact graph. Pausing them does not
  reopen kernel completion.

### Evidence before abstraction

- Shared abstractions require two unlike executable consumers or a named
  correctness/security reason for earlier centralization.
- Connector contracts are derived from independent MCP and OAuth SaaS slices.
  A2A remains separate until identity and state map without loss.
- A shared client follows independent desktop/mobile and local/fake-remote
  characterization; platform-only concerns stay outside the common contract.
- Cost facts, budget decisions, gateway enforcement and advisory routing remain
  separate outcomes.

### Kernel and orchestration boundaries

- Capability rules stay in features; cross-capability sequencing stays in one
  application layer; package fronts may aggregate downward.
- Controlled execution remains one public operation while private collaborators
  own receipt/fencing, reconciliation, control, cancellation, invocation and
  event projection.
- The tooling feature must not depend upward on application orchestration.
- Production code normally uses
  `src/<layer>/<capability-or-integration>/<descriptive-file>`. Kebab-case
  prefixes replace classificatory nesting; extra depth requires an independently
  owned boundary. Internal fronts use `public.ts`; package/subpath fronts use
  `index.ts`.
- New hand-written production and test modules are limited to 500 physical
  source lines. Existing exceptions are pinned by ceiling and digest; content
  changes require decomposition unless a versioned waiver names a follow-up.

### Qualification, publication and packaging

Use these states distinctly:

```text
implemented -> qualified -> published and supported
```

Publication supports an exact upstream contract/version and package-release
window under a maintenance owner and deprecation policy. Later upstream
versions require fresh evidence. Every continuing-programme public surface
registers a deterministic, non-skipping qualifier; all later releases rerun the
cumulative registry. Adapter publication remains serialized under ADR-010.

One `llm-core` package with explicit subpaths remains the default. A separate
package requires measured pressure from incompatible peers or platforms,
independent cadence/ownership, material build/install cost, consumer upgrade
needs, or security/release constraints. Subpath count is not evidence.

The first shared client remains behind `./client`. Source qualification precedes
publication; the final tarball must pass isolated Node, browser-bundler and
Metro consumers. Metro qualification supports the portable client runtime and
declarations for the declared React Native/Metro window. It does not promise UI
components, native modules, secure storage, OAuth/deep links, background work or
application lifecycle behavior.

### Governance

Task front matter is authoritative and STATUS is its mechanically checked human
projection. The coordinator owns lifecycle transitions. One task has one
primary owner and write lease; concurrency, worktrees, review and integration
follow [`COORDINATION.md`](../COORDINATION.md). Replaced tasks are cancelled and
retained as provenance.

## Consequences

Architecture v2 has a stable completion point. Continuing work can add evidence,
ecosystem support and products without widening the kernel by inertia. Shared
contracts are earned, publication is a maintenance commitment, and package
splits remain evidence-driven.

## Rejected alternatives

- Keep every researched capability or product inside kernel completion.
- Create Architecture v3 only to describe compatible continuing work.
- Split packages based on subpath count.
- Freeze a generic connector before unlike integrations exist.
- Publish every qualified adapter automatically.
