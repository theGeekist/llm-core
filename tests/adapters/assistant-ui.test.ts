import { describe, expect, it } from "bun:test";
import {
  createAssistantUiInteractionEventStream,
  createAssistantUiInteractionMapper,
  createAssistantUiInteractionSink,
  toAssistantUiCommands,
} from "#adapters";
import type { ModelStreamEvent } from "#adapters";
import type { InteractionEvent, InteractionEventMeta } from "#interaction";
import type { EventStreamEvent } from "#adapters";
import type { AssistantTransportCommand } from "@assistant-ui/react";

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

type CommandCapture = { commands: AssistantTransportCommand[] };

const createCommandCapture = (): CommandCapture => ({ commands: [] });

const appendCommand = (capture: CommandCapture, command: AssistantTransportCommand) => {
  capture.commands.push(command);
};

const createSender = (capture: CommandCapture) => (command: AssistantTransportCommand) => {
  appendCommand(capture, command);
};

describe("Adapter assistant-ui mapping", () => {
  it("maps model deltas into assistant add-message commands", () => {
    const mapper = createAssistantUiInteractionMapper();

    const events = [
      modelEvent(1, { type: "start", id: "m1" }),
      modelEvent(2, { type: "delta", text: "hello" }),
      modelEvent(3, { type: "end", finishReason: "stop" }),
    ];

    const commands = events.flatMap((event) => mapper.mapEvent(event));

    expect(commands).toEqual([
      {
        type: "add-message",
        message: {
          role: "assistant",
          parts: [{ type: "text", text: "hello" }],
        },
      },
    ]);
  });

  it("includes reasoning when configured", () => {
    const mapper = createAssistantUiInteractionMapper({ includeReasoning: true });

    const events = [
      modelEvent(1, { type: "delta", text: "hello" }),
      modelEvent(2, { type: "delta", reasoning: "thinking" }),
      modelEvent(3, { type: "end", finishReason: "stop" }),
    ];

    const commands = events.flatMap((event) => mapper.mapEvent(event));

    expect(commands).toEqual([
      {
        type: "add-message",
        message: {
          role: "assistant",
          parts: [
            { type: "text", text: "hello" },
            { type: "text", text: "Reasoning: thinking" },
          ],
        },
      },
    ]);
  });

  it("maps tool results into add-tool-result commands", () => {
    const mapper = createAssistantUiInteractionMapper();

    const events = [
      modelEvent(1, {
        type: "delta",
        toolResult: { toolCallId: "call-1", name: "lookup", result: { ok: true } },
      }),
      modelEvent(2, {
        type: "delta",
        toolResult: { toolCallId: "call-2", name: "fail", result: "boom", isError: true },
      }),
    ];

    const commands = events.flatMap((event) => mapper.mapEvent(event));

    expect(commands).toEqual([
      {
        type: "add-tool-result",
        toolCallId: "call-1",
        toolName: "lookup",
        result: { ok: true },
        isError: false,
      },
      {
        type: "add-tool-result",
        toolCallId: "call-2",
        toolName: "fail",
        result: "boom",
        isError: true,
      },
    ]);
  });

  it("writes commands through the assistant-ui sink", () => {
    const capture = createCommandCapture();
    const sendCommand = createSender(capture);
    const sink = createAssistantUiInteractionSink({ sendCommand });

    sink.onEvent(modelEvent(1, { type: "delta", text: "hello" }));
    sink.onEvent(modelEvent(2, { type: "end", finishReason: "stop" }));

    expect(capture.commands).toEqual([
      {
        type: "add-message",
        message: {
          role: "assistant",
          parts: [{ type: "text", text: "hello" }],
        },
      },
    ]);
  });

  it("writes commands through the assistant-ui event stream", () => {
    const capture = createCommandCapture();
    const sendCommand = createSender(capture);
    const stream = createAssistantUiInteractionEventStream({ sendCommand });

    const event = modelEvent(1, { type: "delta", text: "hello" });
    stream.emit(toStreamEvent(event));
    stream.emit(toStreamEvent(modelEvent(2, { type: "end", finishReason: "stop" })));

    expect(capture.commands).toEqual([
      {
        type: "add-message",
        message: {
          role: "assistant",
          parts: [{ type: "text", text: "hello" }],
        },
      },
    ]);
  });

  it("supports helper usage with a shared mapper", () => {
    const mapper = createAssistantUiInteractionMapper();

    const deltaCommands = toAssistantUiCommands(
      mapper,
      modelEvent(1, { type: "delta", text: "hello" }),
    );
    const endCommands = toAssistantUiCommands(
      mapper,
      modelEvent(2, { type: "end", finishReason: "stop" }),
    );

    expect(deltaCommands).toEqual([]);
    expect(endCommands).toEqual([
      {
        type: "add-message",
        message: {
          role: "assistant",
          parts: [{ type: "text", text: "hello" }],
        },
      },
    ]);
  });
});
