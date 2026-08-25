# Agent contracts

The agent capability defines portable intent and normalized execution facts:

- `AgentDefinition` identifies instructions, effect requirements, metadata, and skill references;
- `AgentRunner` is implemented by a qualified runtime integration;
- `PreparedAgentDefinition` records preparation by one runner;
- `AgentRun` exposes events, result, cancellation, and intervention controls;
- `AgentResult` reports one terminal status and optional native references.

Qualified native conversation runners extend that base contract through `@geekist/llm-core/agent/runtime`. A registered route profile names the provider, route, exact source contract, and one disposition for each of `conversation.start`, `conversation.continue`, `run.observe`, `run.input.submit`, and `run.cancel`. Supported active input also declares `native-live` or `execution-boundary` delivery.

`NativeAgentRun.providerSession()` exposes only a validated opaque provider session reference while the run is live. `submitInput()` accepts an application-admitted, run-bound request and does not cancel, restart, replace, or assign a new ID to that run. Provider acceptance, recipient observation, causation-correlated processing, and explicitly unavailable evidence remain separate outcomes.

The registered operation matrix is authoritative at the interaction boundary. A fresh conversation requires supported `conversation.start`; a stored provider session requires supported `conversation.continue` and the exact persisted provider, route-profile ID, and route-profile version; event settlement requires supported `run.observe`; and runner cancellation capability must agree with the declared `run.cancel` disposition. The interaction layer does not add another cancellation API. It preserves the existing `AgentRun.cancel()` meaning.

Native continuation snapshots retain the opaque `ProviderSessionRef` beside the portable route identity. The live session reference is read and validated once, cached for early access, and required to agree with any terminal reference. Recreated sessions reject provider, route, or version substitution before a runner starts.

<<< @/snippets/v2/agent-capabilities.ts

Preparation by one runner does not authorise use by another. Active input likewise requires an issuer, scope, revision, and expiry checked by application composition before the integration receives it. Admission samples the injected clock again after asynchronous verification and immediately before minting the admitted input. Reused message or correlation identities are rejected within a run, and later evidence must match the exact accepted message and correlation pair. Resume remains runner-owned and compatibility-gated. The kernel supplies no concrete runner.
