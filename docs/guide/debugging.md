# Debugging & Diagnostics

`llm-core` provides built-in tools to help you understand what your workflow is doing, catch issues early, and ensure production safety.

## Tracing

Tracing lets you visualize the execution flow of your recipe.

### Console Tracing

The simplest way to see what's happening is to enable the console tracer.

```ts
import { recipes } from "@geekist/llm-core/recipes";
import { createBuiltinTrace } from "@geekist/llm-core/adapters";

const trace = createBuiltinTrace();
const workflow = recipes.agent().defaults({ adapters: { trace } }).build();

await workflow.run({ input: "hello" });
```

This will output structured logs for every step, including inputs, outputs, and duration.

### Accessing the Trace Object

Every `Outcome` includes a full trace log. You can inspect this programmatically:

```ts
const result = await workflow.run(input);

if (result.status === "ok") {
  console.log(result.trace); // Array of TraceEvent objects
}
```

## Strict Mode

By default, `llm-core` is permissive. It warns you about potential issues (like missing dependencies) but tries to run anyway.
In production, you often want **Strict Mode**, which treats warnings as errors and halts execution immediately.

### Enabling Strict Mode

You can enable strict mode at the **Workflow** level:

```ts
const workflow = recipes.agent().build();
```

Or at the **Run** level (overriding the workflow default):

```ts
await workflow.run(input, {
  diagnostics: "strict",
});
```

### What Strict Mode Catches

- **Missing Dependencies**: Steps that require a capability (like `model` or `store`) that hasn't been provided.
- **Contract Violations**: Adapters that don't match the expected interface.
- **Unused Plugins**: Plugins registered but never used (helping you keep your bundle size down).

## Diagnostics

When a workflow runs, it collects **Diagnostics**. These are messages about the health of your execution.

### Inspecting Diagnostics

Like the trace, diagnostics are part of the `Outcome`.

```ts
const result = await workflow.run(input);

// Warnings and Errors
console.log(result.diagnostics);
```

### Common Diagnostic Codes

| Code                            | Level      | Meaning                                                          | Action                                                    |
| :------------------------------ | :--------- | :--------------------------------------------------------------- | :-------------------------------------------------------- |
| `capability_dependency_missing` | Warn/Error | A step needs a capability (e.g., `model`) but none was provided. | Register a plugin with `.use()` or check your plugin key. |
| `construct_dependency_missing`  | Warn/Error | Similar to capability, but for specific constructs.              | Ensure you've provided the right Adapter.                 |
| `pipeline_cycle_detected`       | Error      | Your recipe has a circular dependency.                           | Check your `.next()` calls for loops.                     |

## Diagnosing "Paused" Workflows

If your workflow returns a `paused` status, it means a step requested human intervention or an external signal.

```ts
if (result.status === "paused") {
  console.log("Paused at:", result.trace.at(-1)); // See where it stopped
  console.log("Resume token:", result.token); // Save this to resume later
}
```

## Key Takeaways

- [ ] **Strict Mode**: Use it in CI to catch broken references before they ship.
- [ ] **Tracing**: Don't use `console.log`. Use the tracegraph to see inputs/outputs of every step.
- [ ] **Diagnostics**: Warnings aren't just noise; they often predict runtime failures (like missing keys).

## Next Steps

- [Unified Media Inputs](/guide/media-inputs) -> Handling images & files images, audio, and mixed content.
