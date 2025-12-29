// #region docs
import { createBuiltinTrace, fromLlamaIndexTraceSink } from "#adapters";
import { createWorkflow } from "@llamaindex/workflow-core";
import { withTraceEvents } from "@llamaindex/workflow-core/middleware/trace-events";

const builtin = createBuiltinTrace();
const tracePlugin = fromLlamaIndexTraceSink(builtin);
const workflow = withTraceEvents(createWorkflow(), { plugins: [tracePlugin] });
// #endregion docs

void workflow;
