// #region docs
import { Adapter, createBuiltinTrace } from "#adapters";
import type { AdapterTraceEvent } from "#adapters";

// 1. Create a sink (typed)
const builtin = createBuiltinTrace();
const tracePlugin = Adapter.trace("local.trace", builtin);

const input = "Why is the sky blue?";

// 2. Emit from a pack or adapter step
await builtin.emitMany?.([
  { name: "run.start", data: { input } },
  { name: "provider.response", data: { usage: { inputTokens: 12, outputTokens: 42 } } },
  { name: "run.end", data: { status: "ok" } },
]);

// 3. Inspect the timeline (builtin-only)
const events = (builtin as { events?: AdapterTraceEvent[] }).events ?? [];
console.log(JSON.stringify(events, null, 2));
// #endregion docs

void tracePlugin;
