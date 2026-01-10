# Runtime (Execution + Diagnostics)

The **Runtime** is the environment that executes the DAG defined by your **Recipe**.
It is passed to `run(...)` and is responsible for tracing, diagnostics, and maintaining the pause/resume capability.

Related:

- [Adapter Interfaces](/reference/adapters-api)

## Runtime Channel

::: tabs
== TypeScript

```ts
import type { InterruptStrategy, RetryConfig } from "#adapters";

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
import type { Runtime } from "#workflow";

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
