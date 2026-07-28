import { describe, expect, it } from "bun:test";
import {
  createAssistantUiCommandMapper,
  createAssistantUiInteractionEventStream,
  createAssistantUiInteractionSink,
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
    const mapper = createAssistantUiCommandMapper();

    const events = [
      modelEvent(1, { type: "start", id: "m1" }),
      modelEvent(2, { type: "delta", text: "hello" }),
      modelEvent(3, { type: "end", finishReason: "stop" }),
    ];

    const commands = events.flatMap((event) => mapper(event));

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
    const mapper = createAssistantUiCommandMapper({ includeReasoning: true });

    const events = [
      modelEvent(1, { type: "delta", text: "hello" }),
      modelEvent(2, { type: "delta", reasoning: "thinking" }),
      modelEvent(3, { type: "end", finishReason: "stop" }),
    ];

    const commands = events.flatMap((event) => mapper(event));

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
    const mapper = createAssistantUiCommandMapper();

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

    const commands = events.flatMap((event) => mapper(event));

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

  it("preserves JSON tool results and tags values that cannot be serialized", () => {
    const mapper = createAssistantUiCommandMapper();
    const valid = { nested: [null, true, 1, "value"] };
    const circular: { self?: unknown } = {};
    circular.self = circular;
    function toolResult() {
      return "unused";
    }
    const events = [
      modelEvent(1, {
        type: "delta",
        toolResult: { name: "valid", result: valid },
      }),
      modelEvent(2, {
        type: "delta",
        toolResult: { name: "error", result: new Error("boom") },
      }),
      modelEvent(3, {
        type: "delta",
        toolResult: { name: "bigint", result: 42n },
      }),
      modelEvent(4, {
        type: "delta",
        toolResult: { name: "function", result: toolResult },
      }),
      modelEvent(5, {
        type: "delta",
        toolResult: { name: "circular", result: circular },
      }),
    ];

    const commands = events.flatMap((event) => mapper(event));
    const results = commands.map((command) =>
      command.type === "add-tool-result" ? command.result : null,
    );

    expect(results[0]).toBe(valid);
    expect(results.slice(1)).toEqual([
      { type: "llm-core.non-json-value", reason: "error", message: "boom" },
      { type: "llm-core.non-json-value", reason: "bigint", message: "42" },
      { type: "llm-core.non-json-value", reason: "function", message: "toolResult" },
      {
        type: "llm-core.non-json-value",
        reason: "circular",
        message: "Circular reference",
      },
    ]);
    expect(() => JSON.stringify(results)).not.toThrow();
  });

  it("fills fallback text from end events", () => {
    const mapper = createAssistantUiCommandMapper();

    const commands = [
      modelEvent(1, { type: "start", id: "m1" }),
      modelEvent(2, { type: "end", text: "final" }),
    ].flatMap((event) => mapper(event));

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
    const mapper = createAssistantUiCommandMapper({
      includeReasoning: true,
      reasoningPrefix: "Why: ",
      errorPrefix: "Oops: ",
    });

    const commands = [
      modelEvent(1, { type: "delta", text: "hello" }),
      modelEvent(2, { type: "delta", reasoning: "because" }),
      modelEvent(3, { type: "error", error: "boom" }),
    ].flatMap((event) => mapper(event));

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
    const mapper = createAssistantUiCommandMapper();
    const error = { message: "Bad request", code: "E_BAD" };

    const commands = mapper(modelEvent(1, { type: "error", error }));

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
    const mapper = createAssistantUiCommandMapper();
    const error: { self?: unknown } = {};
    error.self = error;

    const commands = mapper(modelEvent(1, { type: "error", error }));

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
    const mapper = createAssistantUiCommandMapper();
    const event = modelEvent(1, {
      type: "delta",
      toolResult: { toolCallId: null, name: "lookup", result: { ok: true } },
    });

    const commands = mapper(event);

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
    const mapper = createAssistantUiCommandMapper();
    const commands = mapper({
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

  it("preserves cross-event state in a bound mapper", () => {
    const mapper = createAssistantUiCommandMapper();

    const deltaCommands = mapper(modelEvent(1, { type: "delta", text: "hello" }));
    const endCommands = mapper(modelEvent(2, { type: "end", finishReason: "stop" }));

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

  it("creates a configured mapper once for cross-event state", () => {
    const mapEvent = createAssistantUiCommandMapper({ includeReasoning: true });

    const deltaCommands = mapEvent(modelEvent(1, { type: "delta", reasoning: "thinking" }));
    const endCommands = mapEvent(modelEvent(2, { type: "end", finishReason: "stop" }));

    expect(deltaCommands).toEqual([]);
    expect(endCommands).toEqual([
      {
        type: "add-message",
        message: {
          role: "assistant",
          parts: [{ type: "text", text: "Reasoning: thinking" }],
        },
      },
    ]);
  });
});
