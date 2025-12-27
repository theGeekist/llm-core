import { workflowEvent, type WorkflowContext } from "@llamaindex/workflow-core";
import type { AdapterTraceEvent, EventStream } from "../types";
import { bindFirst } from "../../maybe";

const ADAPTER_TRACE_EVENT = workflowEvent<AdapterTraceEvent>({
  debugLabel: "adapter.trace",
});

const toWorkflowEventData = (event: AdapterTraceEvent) => ADAPTER_TRACE_EVENT.with(event);

const emitEvent = (context: WorkflowContext, event: AdapterTraceEvent) => {
  context.sendEvent(toWorkflowEventData(event));
};

const emitManyEvents = (context: WorkflowContext, events: AdapterTraceEvent[]) => {
  context.sendEvent(...events.map(toWorkflowEventData));
};

export const fromLlamaIndexWorkflowContext = (context: WorkflowContext): EventStream => ({
  emit: bindFirst(emitEvent, context),
  emitMany: bindFirst(emitManyEvents, context),
});
