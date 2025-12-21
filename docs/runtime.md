# Runtime (Execution + Diagnostics)

The runtime is the single place for operational concerns. It is passed to `run(...)` and can be reused across workflows.

## Runtime Channel
```ts
type Runtime = {
  reporter?: { warn: (message: string, context?: unknown) => void };
  budget?: unknown;
  persistence?: unknown;
  traceSink?: unknown;
  hitl?: unknown;
};
```

Use it like this:
```ts
const runtime = {
  reporter: { warn: (msg, ctx) => console.warn(msg, ctx) },
  budget: { maxTokens: 2000 },
  persistence: { /* adapter */ },
  traceSink: { /* sink */ },
  hitl: { /* adapter */ },
};

const out = await wf.run({ input: "..." }, runtime);
```

## Trace
Trace is always present and records workflow-level events:
- `run.start`
- `run.ok`
- `run.needsHuman`
- `run.error`
- `run.end` (with final status)

Trace is designed to be stable and readable. Hooks or helpers can append additional trace events.

## Diagnostics
Diagnostics capture “why this shape happened” and are always attached to outcomes.

Examples:
- plugin lifecycle declared but not scheduled
- missing requirements
- extension registration warnings

Diagnostics are never required to run in default mode, but they are always present.

## needsHuman Flow
If a run returns `needsHuman`, the outcome includes a partial artefact snapshot:
```ts
if (out.status === "needsHuman") {
  // out.artefact is Partial<Artefact>
  // out.token can be used to resume
}
```

If a recipe supports it, `resume(token, humanInput?, runtime?)` completes the run.

