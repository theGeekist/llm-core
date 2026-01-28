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

  it("fills fallback text from end events", () => {
    const mapper = createAssistantUiInteractionMapper();

    const commands = [
      modelEvent(1, { type: "start", id: "m1" }),
      modelEvent(2, { type: "end", text: "final" }),
    ].flatMap((event) => mapper.mapEvent(event));

    expect(commands).toEqual([
      {
        type: "add-message",
        message: {
          role: "assistant",
          parts: [{ type: "text", text: "final" }],
        },
      },
    ]);
  });

  it("applies custom reasoning and error prefixes", () => {
    const mapper = createAssistantUiInteractionMapper({
      includeReasoning: true,
      reasoningPrefix: "Why: ",
      errorPrefix: "Oops: ",
    });

    const commands = [
      modelEvent(1, { type: "delta", text: "hello" }),
      modelEvent(2, { type: "delta", reasoning: "because" }),
      modelEvent(3, { type: "error", error: "boom" }),
    ].flatMap((event) => mapper.mapEvent(event));

    expect(commands).toEqual([
      {
        type: "add-message",
        message: {
          role: "assistant",
          parts: [{ type: "text", text: "Oops: boom" }],
        },
      },
    ]);
  });

  it("handles non-string error payloads", () => {
    const mapper = createAssistantUiInteractionMapper();
    const error = { message: "Bad request", code: "E_BAD" };

    const commands = mapper.mapEvent(modelEvent(1, { type: "error", error }));

    expect(commands).toEqual([
      {
        type: "add-message",
        message: {
          role: "assistant",
          parts: [{ type: "text", text: "Error: Bad request" }],
        },
      },
    ]);
  });

  it("handles circular error payloads", () => {
    const mapper = createAssistantUiInteractionMapper();
    const error: { self?: unknown } = {};
    error.self = error;

    const commands = mapper.mapEvent(modelEvent(1, { type: "error", error }));

    expect(commands).toEqual([
      {
        type: "add-message",
        message: {
          role: "assistant",
          parts: [{ type: "text", text: "Error: Unknown error" }],
        },
      },
    ]);
  });

  it("generates tool call ids when missing", () => {
    const mapper = createAssistantUiInteractionMapper();
    const event = modelEvent(1, {
      type: "delta",
      toolResult: { toolCallId: null, name: "lookup", result: { ok: true } },
    });

    const commands = mapper.mapEvent(event);

    expect(commands).toEqual([
      {
        type: "add-tool-result",
        toolCallId: "source-1:lookup:1",
        toolName: "lookup",
        result: { ok: true },
        isError: false,
      },
    ]);
  });

  it("drops non-model events", () => {
    const mapper = createAssistantUiInteractionMapper();
    const commands = mapper.mapEvent({
      kind: "trace",
      event: { kind: "trace", at: "now", data: {} },
      meta: baseMeta(1),
    });

    expect(commands).toEqual([]);
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

  it("emits commands for multiple events", () => {
    const capture = createCommandCapture();
    const sendCommand = createSender(capture);
    const stream = createAssistantUiInteractionEventStream({ sendCommand });

    const events = [
      toStreamEvent(modelEvent(1, { type: "delta", text: "hello" })),
      { name: "interaction.model", data: null },
      toStreamEvent(modelEvent(2, { type: "end", finishReason: "stop" })),
    ];

    const result = stream.emitMany(events);

    expect(result).toBe(true);
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

  it("skips invalid stream events and returns null", () => {
    const capture = createCommandCapture();
    const sendCommand = createSender(capture);
    const stream = createAssistantUiInteractionEventStream({ sendCommand });

    const result = stream.emit({ name: "interaction.model", data: null });

    expect(result).toBeNull();
    expect(capture.commands).toEqual([]);
  });

  it("returns false when sendCommand throws", () => {
    const sendCommand = () => {
      throw new Error("fail");
    };
    const stream = createAssistantUiInteractionEventStream({ sendCommand });
    const event = modelEvent(1, { type: "delta", text: "hello" });
    const endEvent = modelEvent(2, { type: "end", finishReason: "stop" });

    stream.emit(toStreamEvent(event));
    const result = stream.emit(toStreamEvent(endEvent));

    expect(result).toBe(false);
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

  it("supports helper usage with mapper options", () => {
    const deltaCommands = toAssistantUiCommands(
      { includeReasoning: true },
      modelEvent(1, { type: "delta", reasoning: "thinking" }),
    );
    const endCommands = toAssistantUiCommands(
      { includeReasoning: true },
      modelEvent(2, { type: "end", finishReason: "stop" }),
    );

    expect(deltaCommands).toEqual([]);
    expect(endCommands).toEqual([]);
  });
});
