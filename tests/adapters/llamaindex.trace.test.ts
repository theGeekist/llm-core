import { describe, expect, it } from "bun:test";
import {
  createWorkflow,
  workflowEvent,
  type WorkflowContext,
  type WorkflowEventData,
} from "@llamaindex/workflow-core";
import { run } from "@llamaindex/workflow-core/stream/run";
import { withTraceEvents } from "@llamaindex/workflow-core/middleware/trace-events";
import { fromLlamaIndexTraceSink, type AdapterTraceEvent } from "#adapters";

let stopEventRef: ReturnType<typeof workflowEvent<string>> | undefined;

const recordTraceEvent = (events: AdapterTraceEvent[], event: AdapterTraceEvent) => {
  events.push(event);
};

const recordTraceEventAt = (events: AdapterTraceEvent[], name: string) =>
  events.findIndex((event) => event.name === name);

const createTraceSink = (events: AdapterTraceEvent[]) => ({
  emit: recordTraceEvent.bind(null, events),
});

const handleStartEvent = (context: WorkflowContext, input: { data: string }) => {
  const stopEvent = stopEventRef;
  if (stopEvent) {
    context.sendEvent(stopEvent.with(input.data));
  }
};

const handleStartEventError = (context: WorkflowContext, input: { data: string }) => {
  void context;
  void input;
  throw new Error("handler failed");
};

const sendEvent = (
  workflow: ReturnType<typeof withTraceEvents>,
  event: WorkflowEventData<unknown>,
) => {
  const context = workflow.createContext();
  context.sendEvent(event);
};

describe("Adapter LlamaIndex trace", () => {
  it("emits start/end events around handlers", async () => {
    const events: AdapterTraceEvent[] = [];
    const sink = createTraceSink(events);
    const plugin = fromLlamaIndexTraceSink(sink);
    const workflow = withTraceEvents(createWorkflow(), { plugins: [plugin] });
    const startEvent = workflowEvent<string>();
    const stopEvent = workflowEvent<string>();
    stopEventRef = stopEvent;

    workflow.handle([startEvent], handleStartEvent);

    await run(workflow, startEvent.with("ok")).until(stopEvent).toArray();

    const names = events.map((event) => event.name);
    expect(names).toContain("workflow.handler.start");
    expect(names).toContain("workflow.handler.end");
  });

  it("emits error events for async handler failures", async () => {
    const events: AdapterTraceEvent[] = [];
    const sink = createTraceSink(events);
    const plugin = fromLlamaIndexTraceSink(sink);
    const workflow = withTraceEvents(createWorkflow(), { plugins: [plugin] });
    const startEvent = workflowEvent<string>();
    workflow.handle([startEvent], handleStartEventError);

    sendEvent(workflow, startEvent.with("fail"));

    const startIndex = recordTraceEventAt(events, "workflow.handler.start");
    const errorIndex = recordTraceEventAt(events, "workflow.handler.error");
    const endIndex = recordTraceEventAt(events, "workflow.handler.end");
    expect(startIndex).toBeGreaterThan(-1);
    expect(errorIndex).toBeGreaterThan(-1);
    expect(startIndex).toBeLessThan(errorIndex);
    expect(endIndex).toBe(-1);
  });
});
