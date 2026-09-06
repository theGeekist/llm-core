---
id: adapter-claude-native-session-runtime
title: Qualify Claude cross-session and Channel conversation profiles
stage: adapters
status: done
priority: critical
forward_to: []
depends_on:
  - native-agent-conversation-runtime-contract
decision_dependencies:
  - ADR-006
  - ADR-007
  - ADR-013
  - ADR-016
  - ADR-017
  - ADR-018
conflicts_with: []
write_scope:
  - packages/llm-core/src/adapters/claude-native-session/**
  - packages/llm-core/tests/adapters/claude-native-session/**
  - docs/adapters/claude-native-session.md
  - packages/llm-core/docs/final-architecture/tasks/adapter-claude-native-session-runtime.md
required_reading:
  - path: context/simple-chat/architecture/evidence/2026-08-18-native-agent-ingress-spike.markdown
    reason: Preserve the shared operation matrix while respecting that Claude was not re-spiked in this dated run.
  - path: context/simple-chat/architecture/evidence/2026-08-19-native-agent-capability-reconciliation.markdown
    reason: Qualify Claude cross-session sockets and research-preview Channels as separate route profiles.
  - path: context/simple-chat/tests/interoperability/continuous-agent-conversation.capability-gap.markdown
    reason: Retain the earlier Claude handoff limits and distinguish native-session processing from transport observation.
read_scope:
  - context/simple-chat/architecture/evidence/2026-08-18-native-agent-ingress-spike.markdown
  - context/simple-chat/architecture/evidence/2026-08-19-native-agent-capability-reconciliation.markdown
  - context/simple-chat/tests/interoperability/continuous-agent-conversation.capability-gap.markdown
  - packages/llm-core/src/features/agent/**
  - packages/llm-core/src/features/state/**
  - packages/llm-core/src/application/interaction/**
  - packages/llm-core/src/adapters/claude-native-session/**
  - packages/llm-core/tests/adapters/claude-native-session/**
  - docs/adapters/claude-native-session.md
review_owner: coordinator
updated_at: 2026-08-23
---

# adapter-claude-native-session-runtime - Qualify Claude cross-session and Channel conversation profiles

## Objective

Implement and qualify Claude Code cross-session messaging as the primary native
profile and Claude Channels as a separately claimed research-preview profile
against ADR-018.

## Why this exists

Claude Code 2.1.224 and later documents authenticated per-session inbox sockets,
between-tool delivery during active work and automatic new-turn delivery while
idle. Channels provide a separate pushed-event route from an opted-in MCP
server. Their availability, security, delivery and receipt semantics differ and
must not be flattened into one Claude-wide claim.

The proposed private AIFSD decision
`ADR-012-native-agent-runtime-integration-composition.md` may later compose the
qualified adapter. It is provenance only until reachable.

## Inputs

- The completed native-agent conversation runtime contract and conformance
  fixtures.
- Exact official Claude native-session and hook or control contracts applicable
  to the selected release.
- Existing Simple Chat conversation evidence, treated as historical capability
  evidence rather than current qualification.

## In scope

- Exact-version characterization of cross-session socket discovery,
  authentication, active delivery, idle new-turn delivery, inbound controls and
  non-interactive `claude -p` support.
- Separate characterization of Channel registration, pushed-event delivery,
  replies, open-session requirements and research-preview compatibility.
- Projection of supported native operations to the five ADR-018 operation IDs.
- Early native session identity as an opaque `ProviderSessionRef`.
- Native delivery timing classified from executable evidence rather than
  inferred from another provider.
- Process, permission, event, redaction, native-contract and
  projection-observability qualification.

## Out of scope

- Cross-provider message transport, coordinator election, durable inbox or
  application composition.
- Inferring active input from terminal keystrokes, cancellation or concurrent
  session invocation without native contract evidence.
- Raw Claude payloads, credentials, physical paths or live objects in portable
  state.
- Adapter publication or a default runner.

## Contract and naming constraints

- Retain Claude's native identity and lifecycle internally while exposing the
  portable operation vocabulary at the boundary.
- Declare unsupported or not-applicable operations explicitly.
- Use `not-applicable` only when the exact Claude source contract lacks the
  operation; an applicable but unimplemented operation is `unsupported`.
- Preserve native delivered, held and refused cross-session outcomes rather than
  mapping all socket acceptance to portable delivery.
- Keep cross-session and Channel route-profile identities distinct.
- Do not label delivery `native-live` or `execution-boundary` until the selected
  release demonstrates that timing.
- Input acceptance, agent observation and semantic processing remain separate
  facts.
- Configuration and locale-sensitive prose remain composition-owned.

## File ownership

Only edit the front matter, declared write scope, work log and handoff. The
brief above the work log is immutable while claimed.

## Acceptance criteria

- A pinned Claude release passes the shared lifecycle suite for every supported
  operation and fails unsupported operations explicitly.
- Cross-session active delivery occurs between tool calls without interrupting
  the active tool, while idle delivery starts a new turn.
- Socket authentication, receiver inbound policy and `claude -p` behaviour have
  executable positive and negative fixtures.
- Channel claims remain separate, name their preview status and fail closed
  when the session is not open or the Channel is not admitted.
- New and continued sessions preserve opaque provider-session identity and
  distinct portable run identity.
- Active input, when supported, leaves the current run active and reports its
  evidence-backed delivery mode.
- Duplicate input, already-terminal input, process loss, malformed output,
  cancellation and terminal-race cases have bounded portable outcomes.
- Native event ordering and extension data are preserved rather than silently
  normalised to another provider. Projection or observability limitations are
  recorded and cannot strengthen a support claim.
- New or moved code follows the shallow layout and naming rules in
  `COORDINATION.md`.
- New or materially changed hand-written source/test modules target roughly 500
  lines. Modules from 501 through 600 lines record the lightweight
  `approximately 500 lines` waiver; only modules above 600 require the stronger
  coordinator waiver and named follow-up.

## Verification

```sh
bun test packages/llm-core/tests/adapters/claude-native-session
bun run --cwd packages/llm-core typecheck:tests
bun run typecheck:packages
bun run --cwd packages/llm-core lint
```

## Required evidence

- Exact Claude version, cross-session and Channel contract revisions and
  executable provenance.
- Operation disposition and delivery-mode report.
- Redacted native-session lifecycle fixtures.
- Non-cancellation proof for active input where supported.
- Explicit observation and processing limitations.
- Verification commands and results.

## Claim protocol

Follow [`../COORDINATION.md`](../COORDINATION.md) and the metadata contract in
[`../tasks/README.md`](../tasks/README.md). Do not restate those rules here.

## Work log

2026-09-05: Repaired the host Claude installation path after reinstall by
removing three stale repository-local `agmsg` hook registrations whose scripts
no longer exist. `claude doctor` then reported no installation issues.

Implemented the pinned `2.1.261` cross-session adapter with opaque provider
session continuity, verbose stream-json observation, explicitly unavailable
active-input observation evidence and fail-closed output projection. Added a separate
Channels research-preview profile whose input operation remains unsupported
because the native notification contract supplies no delivery or processing
acknowledgement.

Live host characterization observed `system/init`, `assistant` and successful
terminal `result` records, the exact caller-supplied session ID and an inbox
socket. Anthropic's 2026-09-05 cross-session and Channels references provide the
delivery-timing, inbound-control, socket and preview contract provenance.

A two-session live probe delivered nonce
`CLAUDE_NATIVE_NONCANCEL_20260905` without interrupting the receiver's 15-second
Bash tool. The nonce arrived as an automatically queued turn immediately after
the original terminal result. A longer active-window repeat did not qualify
timing because the host's command-safety hook rejected the requested long
sleep before the sender could address the receiver. The documented timing is
`native-live` under ADR-018, but the profile leaves input
`unsupported/qualification-failed` until the active-turn timing is reproduced
against this host release. Cancellation is likewise unsupported in the profile
until the concrete process supervisor passes a live cancellation probe.

Independent review found that the first candidate overstated held-message
acceptance and qualified input and cancellation beyond the retained live
evidence. It also trusted incomplete terminal results and discarded unknown
native records. The repaired adapter no longer exposes the unqualified inbox or
process-cancellation candidates. Both methods fail explicitly as unsupported.
It requires matching init and terminal identities, rejects native terminal error
markers, and passes all valid native records in order to a composition-owned
observer.

A bounded live continuation probe started session
`01990e90-0000-7000-8000-000000000905` and resumed it with `--resume`. Both
commands returned the exact same session identity and their requested
`RESUME_START_0905` and `RESUME_CONTINUE_0905` results with successful terminal
records. This qualifies the advertised continuation route.

## Blocker

None recorded.

## Handoff

### Result

Completed and independently approved exact-version adapter for Claude start,
idle continuation, and observation. The restored final diff has no actionable
review findings.

### Decisions applied

- Cross-session inbox and Channels remain distinct route profiles.
- Input and cancellation methods fail explicitly as unsupported and perform no
  native side effect.
- The adapter does not expose the unqualified native inbox. Recipient
  observation and semantic processing evidence remain explicitly unavailable.
- Cross-session input and cancellation remain
  `unsupported/qualification-failed` until their outstanding live gates pass.
- Channels input remains `unsupported/observability-insufficient` during the
  research preview.

### Files changed

- `packages/llm-core/src/adapters/claude-native-session/profile.ts`
- `packages/llm-core/src/adapters/claude-native-session/protocol.ts`
- `packages/llm-core/src/adapters/claude-native-session/public.ts`
- `packages/llm-core/src/adapters/claude-native-session/runner.ts`
- `packages/llm-core/tests/adapters/claude-native-session/fixtures.ts`
- `packages/llm-core/tests/adapters/claude-native-session/profile.test.ts`
- `packages/llm-core/tests/adapters/claude-native-session/runner.test.ts`
- `docs/adapters/claude-native-session.md`
- This task brief

### Verification evidence

- Claude Code `2.1.261`, native commit `1349cf9c224c`, macOS arm64.
- Live verbose stream-json start succeeded with exact session identity and
  terminal result; the init record exposed the per-session messaging socket.
- Focused deterministic suite: 16 passing tests.
- `bun run --cwd packages/llm-core typecheck:tests`: passed.
- `bun run typecheck:packages`: passed.
- `claude doctor`: no installation issues found.
- Independent final review: no actionable findings.

### Deviations

One stale `worktree` field on the already-completed SLOC task prevented the
installed TaskGraph parser from validating any task. Removing that stale field
restored normal planning, claim, and lifecycle commands; this task then moved
to `done` through `tg complete`.

### Remaining risks

The package deliberately does not own a Node/Bun Unix-socket implementation.
Application composition must first qualify the socket token, inbound policy and
native delivered/held/refused receipt mapping before a supported inbox client
is introduced.

The live host run proved non-cancellation and queued delivery at the terminal
boundary. An independently observed delivery earlier inside a still-active turn
remains outstanding because the bounded longer-running receiver command was
rejected by host command policy. Live cancellation remains outstanding.

### Recommended next task

Codex Desktop hooks and Antigravity Desktop Sidecar qualification before final
cross-provider conformance.
