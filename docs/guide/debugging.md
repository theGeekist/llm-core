# Observability & Debugging

AI workflows are notoriously hard to debug. When an agent gives the wrong answer, was it the prompt? The context? The model temperature? A silent tool failure?

`llm-core` treats **observability as infrastructure**. It assumes that you cannot ship reliable AI products unless you can see exactly what happened in every step of every run.

---

## 1) Stop reading logs. Start reading traces.

The structure of a workflow is a graph. The best way to debug it is to look at that graph.

Every `Outcome` includes a `trace` object. This is a structured record of every step that ran, what input it received, what output it produced, and how long it took.

```ts
const result = await workflow.run(input);

if (result.status === "ok") {
  // Don't just log the answer. Log the path.
  console.log(result.trace);
}
```

Instead of guessing why the model hallucinated, you can inspect the trace and see: "Ah, the retrieval step returned zero documents."

**Console Tracing (Development)**
For local development, you can stream this trace to your console.

```ts
import { createBuiltinTrace } from "@geekist/llm-core/adapters";

const workflow = recipes
  .agent()
  .defaults({ adapters: { trace: createBuiltinTrace() } })
  .build();
```

---

## 2) Strict Mode: Safety at Build Time

Most frameworks are permissive: if you forget a capability, they might fail silently or throw a vague runtime error.

In production, you want **Strict Mode**. It treats warnings as hard errors.

```ts
// If you are missing a retriever, this throws BEFORE the run starts.
await workflow.run(input, {
  diagnostics: "strict",
});
```

Strict mode catches:

- **Missing Capabilities**: Asking for retrieval without providing a retriever adapter.
- **Dead Code**: Registering plugins that are never used by any step.
- **Contract Violations**: Adapters that don't match the expected interface.

This moves bugs from "My user saw a crash" to "My build failed".

---

## 3) Diagnostics: Health Checks

Every run also returns `diagnostics`. These are specific warnings about the health of your execution.

```ts
const result = await workflow.run(input);

if (result.diagnostics.length > 0) {
  // E.g. "Tool call validation failed, retrying..."
  console.warn("Run succeeded with warnings:", result.diagnostics);
}
```

A workflow might succeed (produce an answer) but still be unhealthy (it retried 3 times or dropped an invalid tool call). Diagnostics tell you about this friction so you can fix it before it becomes a failure.

---

## 4) Debugging "Paused" flows

If your workflow hits a human gate or a long-running tool, it returns `status: "paused"`.

This is not an error. It's a structured state.

```ts
if (result.status === "paused") {
  // See exactly where it stopped
  const lastStep = result.trace.at(-1);
  console.log(`Waiting for input at step: ${lastStep.id}`);

  // Save the token to resume later
  await db.save(result.token);
}
```

Because the trace is preserved, when you resume days later, you still have the full history of how you got there.
