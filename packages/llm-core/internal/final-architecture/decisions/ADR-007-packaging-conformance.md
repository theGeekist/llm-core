# ADR-007 — AI SDK 7 Packaging, Conformance and Second Runtime

Architecture version: v2
Status: accepted
Date: 2026-07-29
Owners: architecture coordinator
Affected tasks: core-ai-sdk-packaging, core-ai-sdk-adapter, capabilities-context-artifacts, capabilities-evaluation, capabilities-runtime-conformance
Supersedes: none

## Context

The package publishes ESM and CommonJS while the assessed AI SDK 7 baseline is
ESM-only and requires a newer runtime. A second runtime is also needed to prove
that neutral contracts are not an AI SDK facade.

## Decision

- Publish ESM only. CommonJS is removed unless api-baseline identifies a current,
  named consumer that cannot migrate and demonstrates the requirement.
- Permit the Node baseline to increase to the minimum version justified by the
  accepted dependency and runtime posture. core-ai-sdk-packaging records the selected version
  and evidence.
- Define conformance levels for model/content, tools/control, events, state and
  runner behavior.
- Use the local runner plus one Python runtime adapter as the first two
  reference implementations.
- The architecture coordinator selects the first Python runtime when capabilities-runtime-conformance is
  made ready, using the conformance requirements then in force.
- Record framework/package versions and known semantic loss with every support
  declaration.
- Complete and converge the core stage before any capabilities-stage task
  becomes ready.

## Consequences

The package does not carry dual-module complexity speculatively. A Node
baseline increase is an explicit, evidence-backed packaging change rather than
an accidental adapter side effect. Python-runtime selection remains a
coordinator decision, not a worker-local architecture choice.

## Later extension

ADR-014 applies this versioned conformance and serialized publication posture
to protocol/connector adapters and any shared client package. Integration
breadth does not relax this decision.
