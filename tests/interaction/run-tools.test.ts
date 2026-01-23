import { describe, expect, it } from "bun:test";
import type { AdapterBundle } from "#adapters/types";
import type { Message, MessagePart } from "#adapters/types/messages";
import type { InteractionInput, InteractionState } from "../../src/interaction/types";
import { reduceInteractionEvent } from "../../src/interaction/reducer";
import { applyRunTools } from "../../src/interaction/steps";

const createInteractionInput = (): InteractionInput => ({
  interactionId: "interaction-1",
  correlationId: "corr-1",
});

const createAssistantMessage = (content: Message["content"]): Message => ({
  role: "assistant",
  content,
});

const createState = (messages: Message[]): InteractionState => ({
  messages,
  diagnostics: [],
  trace: [],
  events: undefined,
  lastSequence: 0,
  private: undefined,
});

const createOptions = (input: {
  state: InteractionState;
  adapters?: AdapterBundle;
  interactionInput?: InteractionInput;
}) => ({
  context: {
    adapters: input.adapters,
    reducer: reduceInteractionEvent,
    reporter: {},
  },
  input: input.interactionInput ?? createInteractionInput(),
  output: input.state,
  reporter: {},
});

const readToolResultParts = (message: Message) => {
  if (typeof message.content === "string") {
    return [] as MessagePart[];
  }
  const parts = message.content.parts ?? [];
  return parts.filter((part) => part.type === "tool-result");
};

const readOutputState = (result: unknown, fallback: InteractionState) => {
  if (!result || typeof result !== "object") {
    return fallback;
  }
  if (!("output" in result)) {
    return fallback;
  }
  return (result as { output: InteractionState }).output;
};

const findToolResult = (parts: MessagePart[], toolName: string) =>
  parts.find((part) => part.type === "tool-result" && part.toolName === toolName) as
    | Extract<MessagePart, { type: "tool-result" }>
    | undefined;

describe("interaction run-tools", () => {
  it("returns output when assistant content has no parts", async () => {
    const message = createAssistantMessage({ text: "Hello" } as Message["content"]);
    const state = createState([message]);
    const options = createOptions({ state });
    const result = await applyRunTools(options);
    const output = readOutputState(result, state);

    expect(output.messages.length).toBe(1);
  });

  it("coerces tool arguments and marks missing tools", async () => {
    const parts: MessagePart[] = [
      { type: "tool-call", toolCallId: "call-1", toolName: "echo", input: 42 },
      { type: "tool-call", toolCallId: "call-2", toolName: "missing", input: null },
    ];
    const message = createAssistantMessage({ text: "Tools", parts });
    const state = createState([message]);
    const tools = [
      {
        name: "echo",
        execute: (input: unknown) => input,
      },
    ];
    const options = createOptions({ state, adapters: { tools } });
    const result = await applyRunTools(options);
    const output = readOutputState(result, state);
    const last = output.messages[output.messages.length - 1];
    if (!last) {
      throw new Error("Expected tool result message.");
    }
    const toolResults = readToolResultParts(last);
    const echo = findToolResult(toolResults, "echo");
    const missing = findToolResult(toolResults, "missing");

    expect(echo?.output).toEqual({ value: 42 });
    expect(missing?.isError).toBe(true);
  });

  it("creates error results for tool execution failures", async () => {
    const parts: MessagePart[] = [
      { type: "tool-call", toolCallId: "err-1", toolName: "error", input: {} },
      { type: "tool-call", toolCallId: "err-2", toolName: "string", input: {} },
      { type: "tool-call", toolCallId: "err-3", toolName: "object", input: {} },
      { type: "tool-call", toolCallId: "err-4", toolName: "unknown", input: {} },
    ];
    const message = createAssistantMessage({ text: "Tools", parts });
    const state = createState([message]);
    const tools = [
      {
        name: "error",
        execute: () => {
          throw new Error("boom");
        },
      },
      {
        name: "string",
        execute: () => {
          throw "string-error";
        },
      },
      {
        name: "object",
        execute: () => {
          throw { message: "object-error" };
        },
      },
      {
        name: "unknown",
        execute: () => {
          throw 123;
        },
      },
    ];
    const options = createOptions({ state, adapters: { tools } });
    const result = await applyRunTools(options);
    const output = readOutputState(result, state);
    const last = output.messages[output.messages.length - 1];
    if (!last) {
      throw new Error("Expected tool result message.");
    }
    const toolResults = readToolResultParts(last);
    const errorResult = findToolResult(toolResults, "error");
    const stringResult = findToolResult(toolResults, "string");
    const objectResult = findToolResult(toolResults, "object");
    const unknownResult = findToolResult(toolResults, "unknown");

    expect(errorResult?.output).toEqual({ error: "tool_error", message: "boom" });
    expect(stringResult?.output).toEqual({ error: "tool_error", message: "string-error" });
    expect(objectResult?.output).toEqual({ error: "tool_error", message: "object-error" });
    expect(unknownResult?.output).toEqual({
      error: "tool_error",
      message: "tool_execution_failed",
    });
  });
});
