# ADR-018: Native-agent conversation runtime contract

Architecture version: v2

Status: accepted

Date: 2026-08-23

Owners: architecture coordinator

Affected tasks: native-agent-conversation-runtime-contract, adapter-codex-app-server-runtime, adapter-codex-desktop-hooks-runtime, adapter-claude-native-session-runtime, adapter-antigravity-cli-hooks-runtime, adapter-antigravity-desktop-sidecar-runtime, native-agent-cross-provider-conformance, task-graph-native-agent-runtime-migration-qualification

Supersedes: none

## Why this ADR exists

`AgentRunner` already separates portable agent intent from provider-owned
execution. It can start a new run, continue an idle provider conversation,
observe events, return a terminal result, cancel work, handle action-bound
intervention and resume from a checkpoint.

What it cannot do yet is let a coordinator have an ordinary conversation with
an agent while that agent is still running.

Two things are missing:

- a coordinator needs the provider conversation reference before the run ends;
  and
- the runtime needs one portable way to send ordinary input to that active run.

We must not fake this with cancellation, checkpoint resume or
`AgentRun.intervene()`. Those operations already mean different things.

Providers also differ in ways that matter. Codex app-server can steer a live
turn. Codex Desktop hooks provide input at execution boundaries. Antigravity
CLI uses hook boundaries. Antigravity Desktop has an `agentapi` route, but its
busy-turn behaviour needs separate qualification. Claude Code cross-session
inboxes have distinct between-tool active delivery and idle new-turn delivery.

The portable contract must preserve those differences. It must not turn them
into one vague "live messaging" flag. This ADR defines the llm-core contract.
It does not decide how AIFSD or Simple Chat use that capability in a product.

## Decision

### Keep the existing lifecycle words

`AgentRunner.start()` without a `ProviderSessionRef` starts a new provider
conversation.

`AgentRunner.start(providerSessionRef)` continues an existing provider
conversation that is idle. This is conversation continuation. It is not called
resume.

`AgentRunner.resume()` remains checkpoint resume. It continues work from an
execution checkpoint. A provider conversation and a checkpoint are different
things.

`AgentRun.intervene()` remains authorised, action-bound control. It can approve,
deny, defer, edit an action, cancel or escalate. It is not the way to say
"also check the authentication code".

`AgentRun.cancel()` still means stop the work. Conversational input must never
cancel, replace or restart the run.

`ConversationId`, `RunId`, `ProviderSessionRef`, checkpoint identity and
durable-execution identity remain separate. An adapter may correlate them, but
llm-core must not pretend they are one identifier.

### Define five portable operations

Each native-agent profile declares its support for these operation IDs:

```text
conversation.start
conversation.continue
run.observe
run.input.submit
run.cancel
```

For each operation, a profile records exactly one disposition:

- `supported`: the exact adapter version and provider route have qualified the
  operation with evidence;
- `unsupported`: the provider route recognises the operation, but the current
  adapter cannot safely provide it, including when it is unimplemented, has
  failed, has drifted from the provider version, or cannot observe enough to
  support the claim; or
- `not-applicable`: the recognised native contract does not have the operation.

`not-applicable` does not mean "we have not built it". The disposition meanings
from ADR-017 remain authoritative. A lossy projection or weak observation may
weaken or reject a support claim. It cannot turn a narrower native operation
into `supported`.

### Describe active input honestly

If a profile supports `run.input.submit`, it also records when the provider
exposes the message to the running agent.

- `native-live`: the provider accepts the input directly into the active run.
- `execution-boundary`: the adapter may accept the input at any wall-clock
  time, but the provider exposes it only at the next eligible hook, tool or
  execution boundary.

Neither mode is better. They describe different provider behaviour.

Provider acceptance proves only that the provider accepted the input. It does
not prove that the model read, understood or followed it. Later processing
evidence needs a causation-correlated provider event or portable projection.
Where the provider cannot expose that evidence, the portable state remains
explicitly unobservable.

### Extend AgentRunner and AgentRun

When a runner supports conversation continuation, a live `AgentRun` exposes
its opaque `ProviderSessionRef` before its terminal result settles. A
coordinator can use the reference to address the provider conversation, but
llm-core never exposes provider-private session state.

A running `AgentRun` also exposes typed `run.input.submit`. It sends ordinary
conversation to the existing run and must not cancel, replace, restart or give
that run a new `RunId`. The operation preserves the runtime's `MaybePromise`
contract.

At minimum, input acknowledgement distinguishes:

```text
accepted
already-terminal
rejected
unsupported
```

`accepted` means the input reached the provider's accepted ingress boundary. It
does not mean model processing. The contract task chooses the exact type names
and preserves a separate processing-evidence result where the provider can
supply one.

An active-input request contains portable JSON, a stable message identity,
submission time and enough correlation to relate later evidence. It does not
copy provider-native payloads. Existing event-ordering and terminal-result
uniqueness rules remain unchanged.

### Require real authority for active input

Sending input to an active agent is authorised work. A `RunId`, provider
session reference, message ID, correlation value, provider credential or native
acceptance is not authority.

Before an adapter receives an input, application composition validates an
application-admitted, run-bound authority capability. It checks the issuer,
scope, revision and expiry. Forged, stale and unauthorised capabilities fail
before native ingress.

Portable evidence may retain a safe authority receipt or reference. It never
retains the live capability, a secret or a provider credential.

### Keep ownership clear

Provider integrations own their native machinery: processes, PTYs, hooks,
app-server connections, native session identities, event ordering, live handles,
workspace execution and trajectory.

llm-core owns the portable operation IDs, support declarations, delivery modes,
acknowledgements, redacted projections, conformance and preservation of the
native contract. It does not expose provider credentials, framework objects,
physical paths, process handles or unredacted provider payloads.

Application composition owns coordinator selection, durable inboxes,
active-input admission, single-writer fencing, retries, supervision and
routing. Neither a runner nor an adapter becomes a message bus, scheduler or
authority service.

### Treat TaskGraph as migration evidence, not a dependency

TaskGraph currently hosts the first executable provider-route identities, hook
normalisation fixtures and delivery observations. Its ADR-006 records that as
a temporary executable reference because this llm-core contract and the AIFSD
SDK front are not yet available to a real consumer.

llm-core remains the long-term owner of these portable operations, provider
profiles, events, delivery receipts and adapters. Migration uses the exact
TaskGraph source revision, schemas and fixtures as evidence. llm-core does not
import TaskGraph as a package dependency.

Migration work begins only after `native-agent-runtime-governance-reconciliation`
finishes and the checkout admits the downstream tasks. TaskGraph removes its
provisional provider code only after llm-core passes the relevant conformance
evidence, AIFSD exposes qualified operations through `@aifsd/sdk`, and a real
consumer dogfoods the whole path.

### Keep route profiles separate

A provider name is not a capability claim. The following are separate profiles
with separate evidence:

- Claude cross-session messaging and Claude Channels;
- Codex app-server and Codex Desktop hooks; and
- Antigravity CLI hooks and Antigravity Desktop Sidecars.

Claude cross-session qualification retains its authenticated per-session socket,
delivered, held and refused outcomes, between-tool active delivery and idle
new-turn behaviour. Claude Channels are a research-preview profile and do not
inherit those claims.

Codex app-server qualification uses a coordinator-owned server and documented
thread, turn, observation and steering operations. Codex Desktop hooks are a
separate execution-boundary profile. Seeing a Desktop process does not prove an
external client can attach to its private embedded server.

Antigravity CLI qualification uses conversation continuation and hook-backed
active delivery. Antigravity Desktop Sidecar qualification uses `agentapi` and
proves busy-turn timing independently. Concurrent headless continuation and
`/btw` are not the primary portable active-input route.

Adapters may expose richer provider-native operations through qualified,
explicit provider subpaths and support reports. The five operation IDs are the
portable waist. They do not claim that providers behave the same way.

## Consequences

Applications can start, continue, observe, converse with and cancel qualified
native agents without confusing conversation with cancellation, intervention or
checkpoint resume. Delivery timing remains visible.

This ADR creates no default runner, agent loop, desktop application, message
bus, AIFSD host or generic runnable facade. Exact adapter qualification and
publication are still required before a provider capability is supported.

## Rejected approaches

- Cancel a run and start another one to simulate conversation.
- Reuse `intervene()` for ordinary conversational input.
- Call provider conversation continuation `resume`.
- Use one boolean for active messaging and hide delivery timing.
- Treat provider acceptance as model-processing evidence.
- Treat identifiers or credentials as active-input authority.
- Collapse all profiles from one provider into a single support claim.
- Attach arbitrary clients to private Desktop processes.
- Put provider processes, hooks, PTYs or native session objects in portable
  state.
- Describe a partial emulation as full support.
- Make Simple Chat transport or unfinished AIFSD composition a hidden llm-core
  dependency.

## Public API and compatibility

The existing `./agent` and `./agent/runtime` fronts remain the home of portable
agent facts and runtime extensions. The contract task chooses exact type names
for operation support, early provider-session access and active-input
acknowledgements. It does not add a package-root runnable facade or generic
`Plugin` interface.

Operation declarations, requests, acknowledgements and projected evidence are
closed portable values. `ProviderSessionRef` stays opaque. Live connections and
handles stay process-local.

The package is pre-compatibility. The contract task may replace an inferior
runner shape and update every call site atomically. It must not add aliases,
dual signatures or serialisation fallbacks.

## Verification

- Distinguish new conversation, idle continuation, active input, cancellation,
  action intervention and checkpoint resume.
- Prove active input leaves the original run alive and does not create a new
  `RunId`.
- Record operation disposition and delivery mode for each exact adapter version
  and route profile.
- Prove early `ProviderSessionRef` availability without exposing native state.
- Keep acceptance and processing evidence separate, including an explicit
  unobservable outcome.
- Reject forged, stale and unauthorised active-input capability before native
  ingress.
- Distinguish applicable-but-unsupported from not-applicable operations.
- Fail explicitly on provider ordering, duplicate input, terminal races, crash
  recovery and single-writer faults.
- Require at least two unlike native integrations to pass the portable lifecycle
  suite before calling the contract cross-provider qualified.

## Follow-up tasks

- `native-agent-conversation-runtime-contract`
- `adapter-codex-app-server-runtime`
- `adapter-codex-desktop-hooks-runtime`
- `adapter-claude-native-session-runtime`
- `adapter-antigravity-cli-hooks-runtime`
- `adapter-antigravity-desktop-sidecar-runtime`
- `native-agent-cross-provider-conformance`
- `task-graph-native-agent-runtime-migration-qualification`
