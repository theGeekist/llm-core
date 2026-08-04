# AIFSD SDK

This public package is the implementation home for AIFSD: a paved road for
building software with AI and integrating AI into delivered software. Source
development happens beside `llm-core` so changes across the SDK and its kernel
can remain atomic. npm publication remains disabled while the first executable
surface is established.

AIFSD begins as one package with two conceptual SDK surfaces:

- **Build SDK** — development orchestration, agents, models, repositories,
  evaluation, CI/CD, infrastructure and remote work.
- **Runtime SDK** — application-facing AI composition through qualified native
  runtime integrations.

No implementation API is committed yet. Executable characterisation will
determine the initial public surface.

The private product architecture and task authority may be mounted locally at
`docs/` for authorised development. That mount is optional and is never part of
the public package or its build. `llm-core` remains the sibling portable
contract, policy, evidence and conformance kernel; it does not own AIFSD product
orchestration.
