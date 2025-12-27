import { describe, expect, it } from "bun:test";
import { createWorkflow } from "@llamaindex/workflow-core";
import { fromLlamaIndexWorkflowContext } from "#adapters";

describe("Adapter event streams", () => {
  it("emits workflow events for LlamaIndex contexts", async () => {
    const workflow = createWorkflow();
    const context = workflow.createContext();
    const stream = context.stream[Symbol.asyncIterator]();
    const adapterStream = fromLlamaIndexWorkflowContext(context);
    const expected = {
      name: "adapter.event",
      data: { ok: true },
    };

    const nextEvent = stream.next();
    adapterStream.emit(expected);

    const received = await nextEvent;
    const value = received.value as { data?: unknown } | undefined;
    expect(value?.data).toEqual(expected);
  });

  it("emits multiple workflow events in order", async () => {
    const workflow = createWorkflow();
    const context = workflow.createContext();
    const stream = context.stream[Symbol.asyncIterator]();
    const adapterStream = fromLlamaIndexWorkflowContext(context);
    const first = { name: "event.one", data: { ok: 1 } };
    const second = { name: "event.two", data: { ok: 2 } };

    const nextFirst = stream.next();
    const nextSecond = stream.next();
    adapterStream.emitMany?.([first, second]);

    const firstEvent = await nextFirst;
    const secondEvent = await nextSecond;
    const firstValue = firstEvent.value as { data?: unknown } | undefined;
    const secondValue = secondEvent.value as { data?: unknown } | undefined;
    expect(firstValue?.data).toEqual(first);
    expect(secondValue?.data).toEqual(second);
  });
});
