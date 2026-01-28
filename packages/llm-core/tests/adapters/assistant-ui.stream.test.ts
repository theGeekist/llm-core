import { describe, expect, it } from "bun:test";
import type { EventStreamEvent, ModelStreamEvent } from "#adapters";
import type { InteractionEvent, InteractionEventMeta } from "#interaction";
import { createAssistantUiInteractionStream } from "#adapters";

type Capture = {
  texts: string[];
  reasoning: string[];
  errors: string[];
  toolCalls: Array<{ toolName: string; toolCallId?: string; args?: unknown }>;
  toolResults: Array<{ result: unknown; isError: boolean }>;
  closed: number;
};

type ToolCallControllerCapture = {
  responses: Array<{ result: unknown; isError: boolean }>;
  closes: number;
};

const createCapture = (): Capture => ({
  texts: [],
  reasoning: [],
  errors: [],
  toolCalls: [],
  toolResults: [],
  closed: 0,
});

const createToolCallCapture = (): ToolCallControllerCapture => ({
  responses: [],
  closes: 0,
});

const createToolCallController = (capture: ToolCallControllerCapture) => ({
  setResponse: (response: { result: unknown; isError: boolean }) => {
    capture.responses.push(response);
    return true;
  },
  close: () => {
    capture.closes += 1;
    return true;
  },
});

const baseMeta = (sequence: number): InteractionEventMeta => ({
  sequence,
  timestamp: 0,
  sourceId: "source-1",
  interactionId: "interaction-1",
});

const modelEvent = (sequence: number, event: ModelStreamEvent): InteractionEvent => ({
  kind: "model",
  event,
  meta: baseMeta(sequence),
});

const toStreamEvent = (event: InteractionEvent): EventStreamEvent => ({
  name: `interaction.${event.kind}`,
  data: { event },
});

const attachCapture = (
  adapter: ReturnType<typeof createAssistantUiInteractionStream>,
  capture: Capture,
) => {
  const toolCallCapture = createToolCallCapture();
  const controller = adapter.controller as unknown as {
    appendText: (text: string) => void;
    appendReasoning: (text: string) => void;
    enqueue: (event: { error?: string }) => void;
    close: () => void;
    addToolCallPart: (input: { toolName: string; toolCallId?: string; args?: unknown }) => {
      setResponse: (response: { result: unknown; isError: boolean }) => void;
      close: () => void;
    };
  };
  controller.appendText = (text: string) => {
    capture.texts.push(text);
  };
  controller.appendReasoning = (text: string) => {
    capture.reasoning.push(text);
  };
  controller.enqueue = (event: { error?: string }) => {
    if (event.error) {
      capture.errors.push(event.error);
    }
  };
  controller.close = () => {
    capture.closed += 1;
  };
  controller.addToolCallPart = (input: {
    toolName: string;
    toolCallId?: string;
    args?: unknown;
  }) => {
    capture.toolCalls.push(input);
    return createToolCallController(toolCallCapture);
  };
  return { toolCallCapture };
};

const emitModelEvents = async (
  adapter: ReturnType<typeof createAssistantUiInteractionStream>,
  events: ModelStreamEvent[],
) => {
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (!event) {
      continue;
    }
    await adapter.eventStream.emit(toStreamEvent(modelEvent(index + 1, event)));
  }
};

describe("assistant-ui stream adapter", () => {
  it("maps text, reasoning, tool calls, and tool results", async () => {
    const adapter = createAssistantUiInteractionStream({ includeReasoning: true });
    const capture = createCapture();
    const toolCapture = attachCapture(adapter, capture);

    await emitModelEvents(adapter, [
      { type: "start" },
      { type: "delta", text: "Hello" },
      { type: "delta", reasoning: "Because" },
      {
        type: "delta",
        toolCall: { name: "lookup", id: "call-1", arguments: { q: "one" } },
      },
      {
        type: "delta",
        toolResult: { name: "lookup", toolCallId: "call-1", result: { ok: true } },
      },
      { type: "end" },
    ]);

    expect(capture.texts).toEqual(["Hello"]);
    expect(capture.reasoning).toEqual(["Because"]);
    expect(capture.toolCalls.length).toBe(1);
    expect(toolCapture.toolCallCapture.responses[0]).toEqual({
      result: { ok: true },
      isError: false,
    });
    expect(toolCapture.toolCallCapture.closes).toBe(1);
    expect(capture.closed).toBe(1);
  });

  it("emits error text and closes on model errors", async () => {
    const adapter = createAssistantUiInteractionStream({ errorPrefix: "Oops: " });
    const capture = createCapture();
    attachCapture(adapter, capture);

    await emitModelEvents(adapter, [{ type: "error", error: "bad" }]);

    expect(capture.errors).toEqual(["Oops: bad"]);
    expect(capture.closed).toBe(1);
  });

  it("ignores non-model events", async () => {
    const adapter = createAssistantUiInteractionStream();
    const capture = createCapture();
    attachCapture(adapter, capture);

    await adapter.eventStream.emit({
      name: "interaction.query",
      data: { event: { kind: "query" } },
    });

    expect(capture.texts).toEqual([]);
    expect(capture.closed).toBe(0);
  });
});
