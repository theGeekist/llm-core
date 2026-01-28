# Agent Orchestration WIP

## Goal

Capture current findings and gaps from Copilot SDK and Codex, then restate them in terms of our design priorities (correctness, DX, determinism, minimal surface area). This is a working document for aligning our agent loop with proven patterns while keeping our runtime and recipes modular.

## Executive Summary

Copilot SDK and Codex show two proven paths:

- Copilot SDK exposes a session surface that accepts custom agents, skills, MCP servers, and tools, but selection/orchestration is implicit and handled by the runtime.
- Codex implements a robust agent loop in core with explicit tool routing, parallel tool execution, retries, and rich item lifecycle events. Sub-agents are spawned and controlled via tools.

We currently have the building blocks (planning pack, tool pack, workflow runtime), but we lack a single, explicit, deterministic “agent loop” surface with reliable selection, lifecycle events, and sub-agent orchestration capabilities. We should mirror Codex’s loop semantics while keeping our recipe-driven architecture.

## Findings: Copilot SDK (Node.js)

Source: `copilot-sdk/nodejs/*`, `copilot-sdk/docs/getting-started.md`

### Surface Capabilities

- `customAgents` at session creation/resume defines agent personas with prompt, tool allowlist, MCP server overrides, and `infer` flag.
- `mcpServers` and per-agent MCP servers are supported.
- `skillDirectories` and `disabledSkills` exist for dynamic instruction bundles.
- Permission requests are first-class for potentially dangerous actions.
- Tool calls are executed by the SDK and normalized into a common result shape.
- Event stream includes `subagent.*` lifecycle events.

### DX Pros

- Simple config-only surface for agents/skills/MCP; no extra orchestration API required.
- Model-inference selection supported via `infer` without explicit routing.

### DX Gaps / Risks

- No explicit agent selection API; users can’t force agent choice deterministically.
- Skills on session resume are flaky (skipped test with shared state).
- Docs mismatch tool event names (`tool.execution_end` vs `tool.execution_complete`).
- Docs under-explain system message modes and skill behavior.

## Findings: Codex (core)

Source: `codex/codex-rs/core/*`, `codex/codex-rs/exec/*`

### Core Loop (Proven Orchestration)

- Streaming sampling loop with retry/backoff and explicit follow-up turns.
- Tool router + parallel tool runtime; tool calls can execute concurrently.
- Explicit lifecycle events for items: command execution, file changes, MCP tool calls, todo lists, reasoning, agent messages, errors.
- Truncation, safety policies, and approvals are integrated into the loop.

### Tool Loop Mechanics (Concrete)

- Tool calls are derived from response items in `ToolRouter::build_tool_call` and dispatched via `ToolCallRuntime` with parallel or exclusive execution guards.
- Tool payload types are normalized: function calls, custom tool calls, local shell, MCP tools.
- Tool outputs are normalized into response input items with consistent logging previews and truncation-aware telemetry.
- Tool cancellation produces tool-specific abort messages (shell tools get extra context).

### Approvals and Sandbox Escalation

- A centralized `ToolOrchestrator` drives approval → sandbox selection → execution → optional retry without sandbox.
- Approvals are cached per “approval key” so repeated operations can auto-approve for session scope.
- Approval policy and sandbox policy jointly decide whether to prompt, skip, or forbid.
- For denied sandbox runs, escalation to no-sandbox is gated by approval policy and re-approval (when needed).

### Planning → Todo List Semantics

- `update_plan` is a tool that updates an in-flight todo list item; plan steps map to `TodoItem` objects.
- Plan updates emit `item.started` on first update and `item.updated` on subsequent updates; the list is completed when the turn ends.

### Skills Loading Guarantees

- Skills are loaded by scope (repo → user → system → admin), then deduped and sorted deterministically.
- Directory traversal is bounded (depth + max directories), and invalid skill frontmatter is reported.
- Skills support optional `SKILL.toml` interface metadata for display/prompt hints.

### Sub-Agent Orchestration

- Sub-agents are spawned and controlled via tools: `spawn_agent`, `send_input`, `wait`, `close_agent`.
- Agent control uses a thread manager with guardrails (spawn limits, status tracking).
- Lifecycle events are emitted around sub-agent actions.

### Tool Registry and Feature Gating

- Tool specs are built centrally with a registry builder that wires handlers and feature flags.
- Tool availability is derived from model capabilities and feature flags (shell type, apply_patch type, web search, collab tools, experimental tools).
- Plan tooling (`update_plan`) is first-class in the tool registry, not a special case in the loop.

### Robustness Patterns

- Parallel tool calls are gated per tool spec; a global lock enforces serial execution when required.
- Tool outputs are normalized into a single response item flow so the loop always follows the same path after tool execution.
- Truncation policy is applied to tool outputs and telemetry previews to prevent runaway context growth.

### DX Signal

- The user-facing SDK is thin because the runtime loop is already robust; the true DX comes from reliable event semantics and agent/tool orchestration guarantees.

## Unified Model For Our Design

We want a first-class “agent loop” that is:

- Deterministic and inspectable.
- Modular in implementation (packs/recipes), but unified in UX.
- Event-driven with stable semantics for UI integration and debugging.
- Trace + diagnostics are always present in outcomes.

### Proposed Minimal Surface (Conceptual)

- `agents`: list of agent personas (compatible with Copilot `CustomAgentConfig`).
- `agentSelection`: explicit override or inferred selection (deterministic tie-break).
- `skills`: directories + disable list (resume-safe).
- `tools`: registry with optional per-agent allowlist.
- `mcpServers`: session-wide plus per-agent overrides.
- `approvals`: central policy for tool execution (per tool, per session) with a single orchestration path.

### Event Semantics (Codex parity, our naming)

- `interaction.item.started|updated|completed` with item types:
  - `agent_message`, `reasoning`, `command_execution`, `file_change`, `mcp_tool_call`, `todo_list`, `error`.
- `interaction.subagent.selected|started|completed|failed`.
- `interaction.diagnostic` always present in outcomes.

### Determinism Guarantees

- Persist selected agent, applied skills, and tool scoping in state snapshots.
- Stable ordering of agent selection and tool filtering (sorted by name).
- Explicit errors when requested agents/tools/skills are missing.

## Gaps Against This Model (Current Repo)

- No explicit agent selection surface.
- No explicit sub-agent tools or lifecycle events.
- Tool loop is split across interaction pipeline and recipes without a single, user-facing “agent loop” contract.
- Item lifecycle events (command execution, file change, MCP tool call) are not standardized in our interaction event stream.
- Skills model exists but does not carry resume-safe snapshots yet.
- No centralized approval/sandbox orchestration comparable to Codex’s `ToolOrchestrator`.
- No standardized plan-to-todo item lifecycle events; plans are not surfaced as structured items.
- No feature-gated tool registry that merges model capabilities, tool specs, and policy in one place.

## Next Steps (Design-First)

1. Define the “agent loop” contract in docs and types (no runtime changes yet).
2. Implement the loop as a prebuilt recipe profile with a high-level runtime entrypoint.
3. Wire in event semantics + determinism guarantees.
4. Add sub-agent tools (minimal v1).
5. Make skills deterministic on resume (snapshot + hash).
6. DX + docs polish.

## Step-by-Step Plan (Concrete)

### Step 1 — Contract First (Types + Docs Only)

Ship types and documentation for:

- `AgentLoopConfig` (no user-facing generics).
- `AgentLoopStateSnapshot` (selected agent ID, applied skills + hash, tool allowlists, approval cache keys).
- `InteractionEvent` extensions: `interaction.item.*`, `interaction.subagent.*`, `interaction.diagnostic`.

Do this without referencing recipes/packs, and ensure:

- Adapter-agnostic semantics (AI SDK, LangChain, LlamaIndex).
- Deterministic ordering rules are part of the contract.
- Trace + diagnostics are mandated in outcomes.

Doc updates:

- `docs/reference/workflow-api.md` (agent loop contract overview).
- `docs/reference/runtime.md` (state snapshot + determinism rules).
- `docs/reference/recipes-api.md` (mention agent loop profile without exposing pack internals).
- `docs/guide/core-concepts.md` (agent loop behavior and event semantics).

Tests:

- Type-level tests for `AgentLoopConfig` and `AgentLoopStateSnapshot` (compile-only).
- Event contract tests ensuring new event types are recognized by reducers/transport.

### Step 2 — Prebuilt Agent Loop Profile + Runtime Entry

Implement a prebuilt profile (internal composition), but expose:

- `createAgentRuntime({ config, adapter, recipe: agentLoop })`.
- `AgentRuntime.run` and `AgentRuntime.stream`.

Internals may compose existing packs, but external DX is a single entrypoint.

Doc updates:

- `docs/guide/hello-world.md` (minimal agent runtime example).
- `docs/guide/advanced-features.md` (agent loop config knobs).
- `docs/reference/runtime.md` (agent runtime API signature).

Tests:

- Runtime smoke test: create agent runtime, run a simple turn, observe events.
- Adapter compatibility test: same loop via AI SDK + LangChain adapters.

### Step 3 — Event Semantics + Determinism Wiring

Implement:

- `interaction.item.*` emission (command execution, todo list, tool call items).
- Deterministic ordering rules for agents, skills, tools.
- Persist `AgentLoopStateSnapshot` at safe boundaries.

Doc updates:

- `docs/interaction/transport.md` (new event types).
- `docs/interaction/pipeline.md` (item lifecycle).
- `docs/guide/interaction-sessions.md` (resume determinism).

Tests:

- Deterministic selection tests (stable sort + tie-break).
- Snapshot roundtrip tests (same inputs → same snapshot).
- Missing agent/tool/skill diagnostics tests.

### Step 4 — Sub-Agent Tools (Minimal v1)

Implement tools modeled on Codex:

- `spawnAgent`, `sendAgentInput`, `waitForAgent`, `closeAgent`.
  Limit: fixed max subagents per interaction; no broadcasts.

Doc updates:

- `docs/guide/advanced-features.md` (sub-agent workflow example).
- `docs/reference/recipes-api.md` (sub-agent events and tool contracts).

Tests:

- Spawn + wait happy path.
- Missing agent id error path.
- Max subagent limit enforced.

### Step 5 — Skills + Resume Semantics

Implement deterministic skill loading and hashing:

- Skills include `{ id, scope, path, hash }` in snapshot.
- Resume validates hashes, emits diagnostics on mismatch.

Doc updates:

- `docs/reference/runtime.md` (skill snapshot + resume rules).
- `docs/guide/core-concepts.md` (skills determinism section).

Tests:

- Resume with same skill set (success).
- Resume with hash mismatch (diagnostic).
- Disable skill behavior is deterministic.

### Step 6 — DX + Docs Polish

Provide concise user journeys:

- “Hello agent” and “multi-agent with approvals + MCP” examples.
- “How it works” section explaining profile vs custom recipes.

Doc updates:

- `docs/index.md` (agent loop entry point).
- `docs/guide/hello-world.md`, `docs/guide/advanced-features.md`.

Tests:

- Example snippets typecheck (docs snippets).

## Open Questions

- How much of Codex’s tooling (approvals, truncation policies, retries) should be first-class vs optional plugins?
- Should we expose an explicit `agent.run` API or rely on `interaction.handle` with `agentSelection`?
- How do we map our existing pack/recipe abstractions to a single unified “agent loop” entrypoint without bloating the public API?
