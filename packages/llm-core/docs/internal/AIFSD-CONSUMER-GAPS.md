# AIFSD consumer gaps

Status: current characterisation evidence

## What the public AIFSD package uses today

The implemented AIFSD source imports llm-core through supported package
fronts. Current imports use `@geekist/llm-core/contracts`. No implemented
AIFSD source or test deep-imports `packages/llm-core/src/**`.

The supported AIFSD claim remains limited to `@aifsd/sdk/config` and
`@aifsd/sdk/integrations`. Internal headless-workbench and project-semantics
modules do not establish a public application-composition front.

## What the planned composition task still needs

The private `application-capability-composition-characterization` task reads
llm-core source to understand capability requirements, candidate resolution,
and catalogue behaviour. Those reads are characterisation inputs, not public
consumer imports.

The required llm-core contracts now have dedicated public owners:

- `@geekist/llm-core/adapters/catalogue` owns inert candidate descriptions,
  registration, and deterministic resolution.
- `@geekist/llm-core/adapters/catalogue/runtime` owns post-acceptance
  acquisition, invocation, and bounded retry contracts.
- `@geekist/llm-core/agent/runtime` owns Agent runner and native-session
  extension contracts only.

The remaining gap belongs to AIFSD: it has not yet characterised or published
`@aifsd/sdk/application`. That future front must prove product definitions,
profiles, immutable plans, and host acquisition through a real consumer. This
repository must not fill the gap with friendly llm-core aliases or claim that
the planned AIFSD front ships.

## Recheck rule

When the AIFSD characterisation starts, run its packed consumer against these
supported llm-core fronts. Record any required source import or reconstructed
type as a bounded llm-core public-front defect. Do not broaden the kernel from
the task proposal alone.
