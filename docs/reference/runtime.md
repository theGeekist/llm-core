# Runtime (Execution + Diagnostics)

The **Runtime** is the environment that executes the DAG defined by your **Recipe**.
It is passed to `run(...)` and is responsible for tracing, diagnostics, and maintaining the pause/resume capability.

Related:

- [Adapter Interfaces](/reference/adapters-api)

## Runtime Channel

::: tabs
== TypeScript

```ts
import type { InterruptStrategy, RetryConfig } from "@geekist/llm-core/adapters";

type Runtime = {
  reporter?: { warn: (message: string, context?: unknown) => void };
  diagnostics?: "default" | "strict";
  budget?: unknown;
  persistence?: unknown;
  traceSink?: unknown;
  retryDefaults?: RetryConfig;
  retry?: RetryConfig;
  resume?: {
    resolve: (request: {
      token: unknown;
      resumeInput?: unknown;
      interrupt?: InterruptStrategy;
      adapters?: unknown;
      declaredAdapters?: unknown;
      providers?: Record<string, string>;
    }) => unknown;
  };
};
```

== JavaScript

```js
const runtime = {
  reporter: { warn: (message, context) => console.warn(message, context) },
  diagnostics: "default",
  budget: { maxTokens: 2000 },
  retryDefaults: { model: { maxAttempts: 3, backoffMs: 100 } },
  retry: { model: { maxAttempts: 2, backoffMs: 0 } },
  resume: {
    resolve: ({ token, resumeInput, interrupt }) => ({
      input: { token, resumeInput, interrupt },
    }),
  },
};
```

:::

Use it like this:

::: tabs
== TypeScript

```ts
import type { Runtime } from "@geekist/llm-core/workflow";

const runtime = {
  reporter: { warn: (msg, ctx) => console.warn(msg, ctx) },
  diagnostics: "default",
  budget: { maxTokens: 2000 },
  persistence: {
    /* adapter */
  },
  traceSink: {
    /* sink */
  },
  retryDefaults: { model: { maxAttempts: 3, backoffMs: 100 } },
  retry: { model: { maxAttempts: 2, backoffMs: 0 } },
  resume: {
    /* adapter */
  },
} satisfies Runtime;

const out = await wf.run({ input: "..." }, runtime);
```

== JavaScript

```js
const runtime = {
  reporter: { warn: (msg, ctx) => console.warn(msg, ctx) },
  diagnostics: "default",
  budget: { maxTokens: 2000 },
  persistence: {
    /* adapter */
  },
  traceSink: {
    /* sink */
  },
  retryDefaults: { model: { maxAttempts: 3, backoffMs: 100 } },
  retry: { model: { maxAttempts: 2, backoffMs: 0 } },
  resume: {
    /* adapter */
  },
};

const out = await wf.run({ input: "..." }, runtime);
```

:::

`interrupt` is the resolved `InterruptStrategy` from `adapters.interrupt`. Resume adapters can use it
to decide whether to restart, continue in place, or adjust how a paused run resumes.

## Types

Trace and diagnostics types are available at the root export:

```ts
import type { DiagnosticEntry, TraceEvent } from "@geekist/llm-core";
```

Agent loop contracts live in the interaction layer:

```ts
import type {
  AgentLoopConfig,
  AgentLoopStateSnapshot,
  InteractionItemEvent,
  InteractionSubagentEvent,
} from "@geekist/llm-core/interaction";
```

## Trace

Trace is always present and records workflow-level events:

- `run.start`
- `run.success`
- `run.paused` (may include `{ pauseKind }` in event data)
- `run.error`
- `run.end` (with final status)

Trace is designed to be stable and readable. Hooks or helpers can append additional trace events.

## Diagnostics

Diagnostics capture “why this shape happened” and are always attached to outcomes.

Examples:

- plugin lifecycle declared but not scheduled
- missing plugin requirements
- missing recipe minimum capabilities
- extension registration warnings

Diagnostics are never required to run in default mode, but they are always present.

### Diagnostics Severity

- `default`: collect + report diagnostics, do not block execution.
- `strict`: treat error diagnostics as failures (e.g., missing requirements or conflicts).
  In strict mode, requirement and contract diagnostics are promoted to error.

Diagnostics are normalized into structured entries with `level`, `kind`, and `message`.

Capability resolution is deterministic and reducer-driven.

## Agent Loop Snapshots

When an agent loop is used, the runtime records a deterministic snapshot per run and emits it as a trace entry (`agent.loop.snapshot`). The snapshot captures selected agent IDs, normalized tool allowlists, and any loaded skills (with hashes) when a `skills` adapter is registered. The skills adapter is runtime-specific so worker environments can supply a loader that uses fetch + `crypto.subtle` instead of `fs`; if skills are configured but no adapter is available, the runtime emits a contract diagnostic and omits skills from the snapshot. On resume, the runtime reloads skills and compares hashes; mismatches emit resume diagnostics.

Determinism rules are part of the contract:

- Agents are ordered by ID for tie-breaking.
- Skills are deduped and sorted by scope, then name, then path.
- Tool allowlists are normalized (trimmed, deduped, sorted) before use.
- Sub-agents and approval cache keys follow the same determinism rules.

When an `EventStream` is attached, the agent runtime emits `interaction.subagent` for the selected agent and `interaction.item` events for plan and response items in a stable order so UIs can consume loop items without reinterpreting model deltas.

The agent runtime also registers sub-agent tools by default:

- `agent.spawn` — create a sub-agent slot (bounded by `subagents.maxActive`, default 4).
- `agent.send` — run the sub-agent with new input and return its outcome.
- `agent.wait` — return the last known outcome for a sub-agent.
- `agent.close` — close a sub-agent slot and emit a completion event.

Disable these tools by passing `subagents: { enabled: false }` to `createAgentRuntime(...)`, or tighten the limit via `subagents.maxActive`.

## paused Flow

If a run returns `paused`, the outcome includes a partial artefact snapshot:

::: tabs
== TypeScript

```ts
if (out.status === "paused") {
  // out.artefact is Partial<Artefact>
  // out.token can be used to resume
}
```

== JavaScript

```js
if (out.status === "paused") {
  // out.artefact is a partial snapshot
  // out.token can be used to resume
}
```

:::

If a recipe supports it, `resume(token, resumeInput?, runtime?)` is exposed; it uses `runtime.resume.resolve(...)` when provided and returns an error outcome when missing (including a `resume.invalidToken` diagnostic when the token is unknown). Paused tokens are process-local unless you supply a durable resume store via runtime configuration (prefer `adapters.checkpoint`, or `adapters.cache` as a fallback).

If helpers registered rollbacks, they are executed before the paused outcome is returned when the
resolved interrupt strategy is `restart`. Rollback failures are reported through the runtime reporter.

## Retry

`retryDefaults` provides per-recipe runtime defaults and `retry` provides per-run overrides.
Resolution order for a given adapter kind is:

1. `runtime.retry` (per-run overrides)
2. `runtime.retryDefaults` (recipe defaults)
3. adapter metadata (`adapter.metadata.retry`, fallback only)

Adapter metadata is only consulted when runtime policy is missing; it does not veto or further
constrain a runtime policy. If no policy is resolved, retries are disabled for that adapter call.
When streaming, retries are only applied if the adapter declares `metadata.retry.restartable = true`.
