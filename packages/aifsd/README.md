# AIFSD SDK

This public package is the implementation home for the AIFSD application-composition SDK. Its intended boundary lets products declare portable capability requirements, resolve qualified implementations through explicit profiles, produce deterministic composition plans and acquire host-owned resources only after a plan is accepted. The software-creation workbench is an AIFSD product built on that boundary, not the definition of the SDK itself. Source development happens beside `llm-core` so changes across the SDK and its kernel can remain atomic.

The application-composition surface remains planned rather than implemented. The current `0.1.0` candidate is limited to the already characterised configuration and integration operations, and becomes publishable as `@aifsd/sdk` only after its exact dependency releases and provenance plan exist.

The SDK supports two initial product journeys:

- **Software delivery**: development orchestration, agents, models, repositories, evaluation, CI/CD, infrastructure and remote work.
- **Application integration**: application-facing AI composition through qualified native runtime integrations.

These journeys are not separate SDK products. New public capability fronts are introduced only after executable use demonstrates a coherent contract and independent ownership. `application/` names internal cross-capability orchestration, while `runtime` remains reserved for actual execution environments and native runtime integrations.

The first characterised public surface is `@aifsd/sdk/config`. It validates a closed portable manifest, resolves externally approved catalogue snapshots, creates reproducibility locks, plans ownership-safe native changes, applies a separately approved plan, and explains resolution and planned-change decisions from immutable renderer-neutral facts captured when those decisions are made. Release trust uses the `local`, `community`, `verified`, and `official` levels defined by the accepted product architecture.

The six operations are `validateManifest`, `resolveManifest`, `createConfigurationLock`, `planChanges`, `applyPlan`, and `explainConfiguration`.

Configuration diagnostics are renderer-neutral portable data with the closed shape `{ code, reasonCode, path? }`. The SDK supplies stable categories, causes and locations; consuming CLIs and UIs own prose and localisation.

`@aifsd/strict-json` owns the consumer-neutral JSON boundary shared with `@geekist/llm-core`: strict normalisation, canonical bytes and valid-graph freezing. AIFSD retains configuration diagnostics, secret-reference policy, hashing and the point at which accepted configuration becomes immutable.

```bash
# Available after all four exact releases have registry evidence
npm install @aifsd/sdk@0.1.0 @geekist/llm-core@2.0.0 @aifsd/strict-json@0.1.0 @wpkernel/pipeline@1.4.1
```

The `0.1.0` support claim is deliberately limited to `@aifsd/sdk/config` and `@aifsd/sdk/integrations`. It is not a claim that the complete AIFSD paved road, clients, templates, hosted operations or delivery orchestration are published.

Run the repository-root `bun run build` before consuming the workspace package from Node so the kernel dependency and SDK are built in order. Runtime code resolves to generated ESM under `dist/`, while generated declarations supply its TypeScript contract. The package tests exercise the runtime export with the actual `node` executable and the declaration surface from a clean TypeScript consumer.

The private product architecture and task authority may be mounted locally at `docs/` for authorised development. That mount is optional and is never part of the public package or its build. `llm-core` remains the sibling portable contract, policy, evidence and conformance kernel; it does not own AIFSD product orchestration.
