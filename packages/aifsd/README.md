# AIFSD SDK

This public package is the implementation home for AIFSD: a paved road for
building software with AI and integrating AI into delivered software. Source
development happens beside `llm-core` so changes across the SDK and its kernel
can remain atomic. npm publication remains disabled while the first executable
surface is established.

AIFSD is one SDK supporting two initial product journeys:

- **Software delivery**: development orchestration, agents, models,
  repositories, evaluation, CI/CD, infrastructure and remote work.
- **Application integration**: application-facing AI composition through
  qualified native runtime integrations.

These journeys are not separate SDK products. New public capability fronts are
introduced only after executable use demonstrates a coherent contract and
independent ownership. `application/` names internal cross-capability
orchestration, while `runtime` remains reserved for actual execution
environments and native runtime integrations.

The first characterised public surface is `@aifsd/sdk/config`. It validates a
closed portable manifest, resolves externally approved catalogue snapshots,
creates reproducibility locks, plans ownership-safe native changes, applies a
separately approved plan, and explains resolution and planned-change decisions
from immutable renderer-neutral facts captured when those decisions are made.
Release trust uses the `local`, `community`, `verified`, and `official` levels
defined by the accepted product architecture.

The six operations are `validateManifest`, `resolveManifest`,
`createConfigurationLock`, `planChanges`, `applyPlan`, and
`explainConfiguration`.

Configuration diagnostics are renderer-neutral portable data with the closed
shape `{ code, reasonCode, path? }`. The SDK supplies stable categories, causes
and locations; consuming CLIs and UIs own prose and localisation.

`@geekist/strict-json` owns the consumer-neutral JSON boundary shared with
llm-core: strict normalisation, canonical bytes and valid-graph freezing. AIFSD
retains configuration diagnostics, secret-reference policy, hashing and the
point at which accepted configuration becomes immutable.

Run the repository-root `bun run build` before consuming the workspace package
from Node so the kernel dependency and SDK are built in order. Runtime code
resolves to generated ESM under `dist/`, while generated declarations supply
its TypeScript contract. The package tests exercise the runtime export with the
actual `node` executable and the declaration surface from a clean TypeScript
consumer.

The private product architecture and task authority may be mounted locally at
`docs/` for authorised development. That mount is optional and is never part of
the public package or its build. `llm-core` remains the sibling portable
contract, policy, evidence and conformance kernel; it does not own AIFSD product
orchestration.
