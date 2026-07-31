# ADR-014 — Integration Runtime, Cost Intelligence and Client Applications

Architecture version: v2
Status: accepted
Date: 2026-08-01
Owners: architecture coordinator
Affected tasks: integrations-connector-contracts, integrations-authorization-lifecycle, capabilities-cost-intelligence, applications-client-contract, applications-desktop, applications-mobile, adapters-protocol-qualification
Supersedes: none

## Context

The v2 kernel already separates model resolution, controlled effects, durable
execution, evidence and qualified adapters. The next product layer needs to
connect MCP servers, A2A peers and SaaS APIs, authorize them safely, and expose
useful run and cost information to end users on desktop and mobile.

These concerns share identity, control and evidence infrastructure, but they
are not one protocol. MCP exposes tools and resources, A2A delegates work to a
remote agent with its own state, and SaaS connectors have provider-specific
authorization, pagination, webhooks, quotas and failure semantics. Flattening
them into one plugin interface would hide the differences that conformance
must prove.

Cost information has a similar boundary problem. Observed token usage, a cost
computed from a price snapshot, and a charge reconciled from a provider record
are different facts. A client application must not present an estimate as an
invoice or infer consumer-plan quota from unsupported scraping.

Desktop and mobile applications also have platform responsibilities that do
not belong in the portable kernel: browser authorization callbacks, secure
credential storage, local caches, notifications, offline synchronization and
OS lifecycle behavior.

## Decision

### Integration runtime

- Add a connector contract layer with stable connector identity, exact adapter
  and protocol versions, capability descriptors, configuration schema, effect
  and data classification, health state, and a versioned support/loss report.
- Keep connector families explicit. Tool/resource connectors, remote-agent
  connectors, authorization providers and usage providers may share lifecycle
  and evidence contracts, but each retains its native operations and state.
- MCP tool invocation enters the existing schema, policy, approval, action
  digest, receipt and cancellation path. A2A retains remote agent, task,
  delegation and session identity unless an exact portable mapping is proven.
- SaaS SDK objects, provider tokens and protocol-native state never cross the
  adapter boundary. Connector adapters live outside the kernel feature and are
  qualified against exact versions before publication.
- Reliability is explicit and operation-specific: idempotency keys,
  retryability, backoff/rate-limit disposition, pagination, webhook or polling
  cursors, deduplication, reconciliation and circuit state are declared rather
  than implied by a generic retry wrapper.

### Authorization and secrets

- Portable values may carry an opaque `ConnectionRef`,
  `AuthorizationGrantRef` or existing `SecretRef`; they never carry access
  tokens, refresh tokens, client secrets, passwords or private keys.
- Composition owns secret resolution and an authorization coordinator owns
  consent, scopes, audience/resource binding, PKCE/state validation, callback
  completion, refresh, rotation and revocation. Connectors receive the
  least-authority credential material required for one operation.
- Desktop and mobile shells provide platform authorization coordinators and
  secure-storage implementations. The connector contract cannot assume a
  loopback server, custom URI scheme, universal link, embedded browser or a
  particular operating-system vault.
- Authorization state is not permission to execute an effect. Policy and
  approval are re-evaluated through ADR-005 for every controlled action.

### Cost intelligence

- Preserve three non-substitutable facts: a `UsageReceipt` for observed usage,
  a `CostEstimate` calculated from a versioned price/currency snapshot, and a
  `ReconciledCost` linked to an authoritative provider usage or billing record.
- Every estimate records the pricing source, version/effective time, currency,
  units, assumptions and unavailable/partial disposition. Missing or stale
  pricing never mints a cost fact.
- Budget controls operate before dispatch, during a bounded run when updated
  usage is available, and after completion. Each allow, warn, reroute, stop or
  overrun outcome is recorded as evidence; interruption never rewrites
  observed usage.
- Routing considers required capabilities and quality gates before privacy,
  residency, latency and cost. “Which model should have answered this?” is an
  evaluation-backed counterfactual recommendation, not a live guess based only
  on price.
- Cache reads and writes produce evidence that distinguishes reused output,
  avoided estimated usage and actual provider usage. Avoided cost is never
  reported as a provider charge.
- Price catalogues, exchange rates, invoices and billing reconciliation remain
  host/service concerns behind ports; the kernel owns portable facts and
  decision evidence only.

### End-user client applications

- Add a shared client-application contract for account/tenant selection,
  connector management, run submission and control, event synchronization,
  approvals, usage/cost views, cache state and offline conflict disposition.
  It consumes curated public package surfaces and never deep-imports features.
- The desktop application is the first full operator surface. It may provide a
  local profiler, local connector host and secure credential broker, while
  delegating durable or long-running work to a qualified runtime/service.
- The mobile application is a companion execution and control surface for
  conversations, approvals, run status, notifications and cost analytics. A
  suspended mobile process is not a durable executor.
- Shared domain/view contracts do not require shared native infrastructure.
  Platform credential stores, OAuth callback handling, background execution,
  notifications and local databases remain platform adapters.
- App implementation lives in an application workspace or separate delivery
  repository, not under `packages/llm-core/src`. No desktop/mobile framework is
  selected by this ADR; each app task must record that choice and its release,
  security and update posture.

### Product and publication boundary

- A hosted connector service, daemon, sync service, price service or billing
  backend is an optional delivery product. None becomes a hidden dependency of
  local `llm-core` execution.
- Consumer subscription/usage tracking uses documented provider APIs, explicit
  user imports, or locally generated receipts. Browser scraping of Pro-plan
  usage pages and collection of session cookies are outside the supported
  design.
- Connector and client package exports require the same serialized publication
  and packed-consumer verification posture as ADR-007 and ADR-010.

## Relationship to earlier decisions

- ADR-003 remains authoritative for portable JSON, identity, versioning and
  namespaced native extensions.
- ADR-004 remains authoritative for model/provider resolution and credential
  ownership; connector authorization adds references, never credential values.
- ADR-005 remains authoritative for effects, policy, approval, receipts and
  retries; connector metadata cannot bypass that control path.
- ADR-006 remains authoritative for state lifetimes and durable execution; an
  app process or remote connector session is not a portable checkpoint.
- ADR-007 remains authoritative for versioned conformance and adapter
  publication; integration breadth does not relax the release gate.
- ADR-013 remains authoritative for operational qualification and evidence;
  this ADR refines its usage/cost boundary and adds the delivery applications.

No earlier ADR is superseded.

## Consequences

The architecture gains a product-shaped path without expanding the root
kernel into an integration platform or billing system. The connector contract
and authorization lifecycle precede protocol publication. Operational evidence
and evaluation qualification precede cost intelligence. A shared client
contract precedes independent desktop and mobile implementation.

The desktop application is intentionally more capable locally; the mobile app
can remain a focused companion without making false background-execution or
secret-portability claims.

## Rejected alternatives

- One flat `Plugin` interface for MCP, A2A, OAuth, SaaS actions and workflows.
- Provider tokens or refresh credentials inside portable connector values,
  events, checkpoints or synchronized app state.
- Generic automatic retries for meaningful connector effects.
- A single numeric `cost` field that conflates estimates, observed usage and
  reconciled charges.
- Selecting the cheapest model without capability, quality, privacy and
  residency gates.
- Embedding desktop or mobile framework code inside the kernel package.
- Treating a desktop loop, mobile background task or provider session as a
  durable execution guarantee.
- Scraping consumer account pages or cookies to infer product-plan usage.

## Verification implications

- Connector conformance must cover authorization loss, scope/audience
  mismatch, rate limits, retry/idempotency, pagination, duplicate events,
  cancellation and ambiguous outcomes.
- Secret-safety tests must prove portable serialization, logs, events, traces,
  app sync and diagnostics contain references or redacted projections only.
- Cost tests must prove estimate provenance, stale/missing price disposition,
  provider reconciliation, budget decisions, cache attribution and currency
  separation.
- Shared-client contract tests must work against local and remote fake hosts.
  Desktop and mobile release gates must include platform callback, secure
  storage, offline/resume and update/migration fixtures appropriate to each OS.
