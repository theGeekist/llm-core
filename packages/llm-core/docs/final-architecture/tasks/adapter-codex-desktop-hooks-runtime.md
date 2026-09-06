---
id: adapter-codex-desktop-hooks-runtime
title: Qualify the Codex Desktop hook bridge
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
  - packages/llm-core/src/adapters/codex-desktop-hooks/**
  - packages/llm-core/tests/adapters/codex-desktop-hooks/**
  - docs/adapters/codex-desktop-hooks.md
  - packages/llm-core/docs/final-architecture/tasks/adapter-codex-desktop-hooks-runtime.md
required_reading:
  - path: context/simple-chat/architecture/evidence/2026-08-19-native-agent-capability-reconciliation.markdown
    reason: Preserve the documented hook route, app-server visibility proof and private embedded-process limitation.
  - path: context/simple-chat/architecture/evidence/2026-08-18-native-agent-ingress-spike.markdown
    reason: Do not convert coordinator-owned app-server evidence into a claim about attachment to Desktop private stdio.
read_scope:
  - context/simple-chat/architecture/evidence/2026-08-19-native-agent-capability-reconciliation.markdown
  - context/simple-chat/architecture/evidence/2026-08-18-native-agent-ingress-spike.markdown
  - packages/llm-core/src/features/agent/**
  - packages/llm-core/src/application/interaction/**
  - packages/llm-core/src/adapters/codex-desktop-hooks/**
  - packages/llm-core/tests/adapters/codex-desktop-hooks/**
  - docs/adapters/codex-desktop-hooks.md
review_owner: coordinator
updated_at: 2026-08-23
---

# adapter-codex-desktop-hooks-runtime - Qualify the Codex Desktop hook bridge

## Objective

Implement and qualify Codex lifecycle hooks as an execution-boundary bridge for
tasks hosted by Codex Desktop without depending on its private embedded
app-server transport.

## Why this exists

Codex hooks can check an external inbox during tool use and stopping, inject
model-visible context and create a Stop continuation prompt. This is useful for
an already-open Desktop-owned task, but it is not equivalent to app-server
`turn/steer` and it cannot start a later turn after the task is fully idle.

## In scope

- Project and user-scoped hook discovery for Desktop-hosted Codex tasks.
- `PreToolUse`, `PostToolUse`, `UserPromptSubmit` and `Stop` checkpoints.
- Correlated execution-boundary context delivery and Stop continuation.
- Explicit unsupported idle wake and private embedded-server attachment.
- Separation from the coordinator-owned app-server profile.

## Out of scope

- Attaching to undocumented Desktop stdio or private process handles.
- Claiming hook context as `native-live` steering.
- Treating Stop continuation as durable idle wake.
- Canonical mailbox, scheduler, retries or application routing.

## Acceptance criteria

- A pinned Codex Desktop release loads the qualified hook profile.
- Input submitted during active work is delivered at a documented safe boundary
  without cancellation or a second active writer.
- Stop continuation processes already-pending work without claiming later idle
  wake.
- Tests reject any dependency on the embedded app-server process, private stdio
  or shared-store implementation details.
- Support reports distinguish hook acceptance, model-visible context and
  causation-correlated processing.

## Verification

```sh
bun test packages/llm-core/tests/adapters/codex-desktop-hooks
bun run --cwd packages/llm-core typecheck:tests
bun run typecheck:packages
bun run --cwd packages/llm-core lint
```

## Work log

Execution mode: shared-checkout
Execution rationale: The task is a small adapter-only slice in the canonical checkout.
Concurrency evaluation: adapter-claude-native-session-runtime and adapter-antigravity-cli-hooks-runtime; start alongside because all source, test, public-document and task-record paths are disjoint.
Concurrent task scopes: Claude native-session and Antigravity CLI/hooks adapters retain their declared scopes.
Swarm delegation: none; Codex coordinator owns implementation, qualification and reconciliation.

2026-09-05: Claimed from `2d7af7b` after TaskGraph planning and full generated
context reading. Verified ChatGPT Desktop `26.901.31953`, its bundled Codex
runtime `0.153.1`, and the current official hook contract.

2026-09-05: Implemented the hook bridge with an application-owned atomic inbox
claim bound to the portable run, native session, and native turn. The three
context boundaries prepare exact `additionalContext` output. `Stop` prepares a
continuation request and refuses recursive Stop projection when
`stop_hook_active` is already set. Explicit commit/release finalisation keeps a
failed native stdout write eligible for redelivery. The adapter does not expose
the Desktop private app-server, transcript format, or shared-store
implementation.

2026-09-05: A disposable exact-version probe ran Bash `sleep 8` in an active
turn, queued `CODEX_HOOK_ACTIVE_20260905`, and delivered it through
`PostToolUse`. The original command completed with status 0 and the same turn
returned the exact nonce. Native hook input included the matching `session_id`,
`turn_id`, `tool_name: "Bash"`, and `hook_event_name: "PostToolUse"`.

2026-09-05: Focused tests and package/test type checks passed. Independent
review found target-binding, premature-commit, evidence-language, stale-log,
and broad-empty-output defects; all were corrected. Final re-review found no
remaining actionable issues.

## Blocker

None recorded.

## Handoff

### Result

Focused-green implementation with exact live `PostToolUse` qualification and
independent final review complete.

### Decisions applied

- Kept Desktop hooks separate from the coordinator-owned app-server profile.
- Declared start, idle continuation, complete run observation, and cancellation
  unsupported on this route.
- Preserved execution-boundary timing and distinguished prepared
  `additionalContext` from a prepared Stop continuation request.
- Bound every submission and atomic claim to the exact run, session, and turn.
- Deferred claim commit until composition reports successful native stdout
  delivery; failed writes release for redelivery.
- Required application composition to own durable storage, authority, retries,
  routing, and atomic claims.

### Files changed

- `packages/llm-core/src/adapters/codex-desktop-hooks/{bridge,profile,protocol,public}.ts`
- `packages/llm-core/tests/adapters/codex-desktop-hooks/bridge.test.ts`
- `docs/adapters/codex-desktop-hooks.md`
- This task brief

### Verification evidence

- Final focused deterministic suite: 10 passing tests and 46 assertions.
- Combined Claude, Antigravity CLI, and Codex suites: 32 passing tests and 75
  assertions before review corrections.
- `bun run --cwd packages/llm-core typecheck:tests`: passed.
- `bun run typecheck:packages`: passed.
- Scoped ESLint: passed with no findings.
- Exact Prettier check: passed.
- Live `PostToolUse` nonce probe: passed on ChatGPT Desktop `26.901.31953` and
  bundled Codex `0.153.1`.

### Remaining risks

Prepared output and native stdout acceptance do not prove that the model
observed or acted on an ordinary input. The live nonce establishes correlated
observation for that one `PostToolUse` probe only. Other boundary shapes remain
contract-fixture evidence.
