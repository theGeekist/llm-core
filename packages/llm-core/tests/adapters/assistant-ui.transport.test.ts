import { describe, expect, it } from "bun:test";
import type { AssistantTransportCommand, JsonValue, MessageContent } from "#adapters";
import {
  parseAssistantTransportRequest,
  toCoreMessagesFromAssistantCommands,
  toMessageContent,
} from "#adapters";

const buildTextCommand = (text: string): AssistantTransportCommand => ({
  type: "add-message",
  message: {
    role: "user",
    parts: [{ type: "text", text }],
  },
});

const buildToolResultCommand = (): AssistantTransportCommand => ({
  type: "add-tool-result",
  toolCallId: "call-1",
  toolName: "search",
  result: { ok: true },
  isError: false,
});

const buildToolResultCommandWithoutName = (): AssistantTransportCommand => ({
  type: "add-tool-result",
  toolCallId: "call-2",
  result: "done",
});

const buildToolCallCommand = (): AssistantTransportCommand => ({
  type: "add-message",
  message: {
    role: "assistant",
    parts: [
      {
        type: "tool-call",
        toolName: "lookup",
        toolCallId: "call-2",
        args: { q: "hello", nested: ["ok", 2, { fine: true }] },
      },
    ],
  },
});

const buildToolResultMessage = (): AssistantTransportCommand => ({
  type: "add-message",
  message: {
    role: "assistant",
    parts: [
      {
        type: "tool-result",
        toolName: "lookup",
        toolCallId: "call-2",
        result: { ok: true },
        isError: true,
      },
    ],
  },
});

const buildTextWithToolPartsCommand = (): AssistantTransportCommand => ({
  type: "add-message",
  message: {
    role: "assistant",
    parts: [
      { type: "text", text: "first" },
      { type: "tool-call", toolName: "calc", toolCallId: "call-3", args: { n: 1 } },
      { type: "text", text: "second" },
      {
        type: "tool-result",
        toolName: "calc",
        toolCallId: "call-3",
        result: { ok: true },
        isError: true,
      },
    ],
  },
});

const buildInvalidPartCommand = (): AssistantTransportCommand => ({
  type: "add-message",
  message: {
    role: "user",
    parts: [{ type: "text", text: 123 } as unknown as { type: "text"; text: string }],
  },
});

const buildInvalidPartsArrayCommand = (): AssistantTransportCommand =>
  ({
    type: "add-message",
    message: {
      role: "user",
      parts: ["not-record"],
    },
  }) as unknown as AssistantTransportCommand;

const buildInvalidPartsTypeCommand = (): AssistantTransportCommand =>
  ({
    type: "add-message",
    message: {
      role: "user",
      parts: "nope",
    },
  }) as unknown as AssistantTransportCommand;

const buildToolCallWithInvalidArgs = (): AssistantTransportCommand => ({
  type: "add-message",
  message: {
    role: "assistant",
    parts: [
      {
        type: "tool-call",
        toolName: "lookup",
        toolCallId: "call-5",
        args: { invalid: (() => null) as unknown as JsonValue },
      },
    ],
  },
});

const buildInvalidCommand = (): AssistantTransportCommand =>
  ({
    type: "add-tool-result",
    result: "missing id",
  }) as AssistantTransportCommand;

describe("assistant-ui transport", () => {
  it("parses valid assistant transport payloads", () => {
    const payload = {
      commands: [buildTextCommand("hi")],
      data: { recipeId: "chat.simple", providerId: "openai", modelId: "gpt-4o-mini" },
    };

    const result = parseAssistantTransportRequest(payload);

    expect(result).not.toBeNull();
    expect(result?.commands.length).toBe(1);
    expect(result?.data?.recipeId).toBe("chat.simple");
  });

  it("rejects invalid payloads", () => {
    expect(parseAssistantTransportRequest(null)).toBeNull();
    expect(parseAssistantTransportRequest({})).toBeNull();
    expect(parseAssistantTransportRequest({ commands: [123] })).toBeNull();
  });

  it("maps assistant commands to core messages", () => {
    const commands = [
      buildTextCommand("Hello"),
      buildToolCallCommand(),
      buildToolResultMessage(),
      buildToolResultCommand(),
    ];

    const messages = toCoreMessagesFromAssistantCommands(commands);
    const firstContent = toMessageContent(messages[0]?.content as MessageContent);
    const toolCallContent = toMessageContent(messages[1]?.content as MessageContent);
    const toolResultContent = toMessageContent(messages[2]?.content as MessageContent);
    if (typeof toolCallContent === "string" || typeof toolResultContent === "string") {
      throw new Error("Expected structured content");
    }

    expect(messages.length).toBe(4);
    expect(messages[0]?.role).toBe("user");
    expect(messages[1]?.role).toBe("assistant");
    expect(firstContent).not.toBeNull();
    expect(toolCallContent.parts?.[0]?.type).toBe("tool-call");
    expect(toolResultContent.parts?.[0]?.type).toBe("tool-result");
    expect(messages[3]?.role).toBe("tool");
  });

  it("joins structured text across multiple text parts", () => {
    const commands = [buildTextWithToolPartsCommand()];

    const messages = toCoreMessagesFromAssistantCommands(commands);
    const content = toMessageContent(messages[0]?.content as MessageContent);
    if (typeof content === "string") {
      throw new Error("Expected structured content");
    }

    expect(content.text).toBe("first\nsecond");
    expect(content.parts?.length).toBe(4);
  });

  it("rejects invalid message parts and roles", () => {
    const invalidRole = {
      commands: [
        {
          type: "add-message",
          message: { role: "system", parts: [{ type: "text", text: "hi" }] },
        },
      ],
    };
    const invalidPart = { commands: [buildInvalidPartCommand()] };
    const invalidPartsArray = { commands: [buildInvalidPartsArrayCommand()] };
    const invalidPartsType = { commands: [buildInvalidPartsTypeCommand()] };

    expect(parseAssistantTransportRequest(invalidRole)).toBeNull();
    expect(parseAssistantTransportRequest(invalidPart)).toBeNull();
    expect(parseAssistantTransportRequest(invalidPartsArray)).toBeNull();
    expect(parseAssistantTransportRequest(invalidPartsType)).toBeNull();
  });

  it("parses tool result commands with defaults", () => {
    const payload = {
      commands: [
        {
          type: "add-tool-result",
          toolCallId: "call-9",
          result: "ok",
        },
      ],
    };

    const result = parseAssistantTransportRequest(payload);

    expect(result?.commands[0]?.type).toBe("add-tool-result");
  });

  it("parses tool-call args with arrays and records", () => {
    const payload = {
      commands: [buildToolCallCommand()],
    };

    const result = parseAssistantTransportRequest(payload);

    expect(result?.commands[0]?.type).toBe("add-message");
  });

  it("rejects tool result commands missing toolCallId", () => {
    const payload = {
      commands: [buildInvalidCommand()],
    };

    const result = parseAssistantTransportRequest(payload);

    expect(result).toBeNull();
  });

  it("fills tool result toolName when missing", () => {
    const messages = toCoreMessagesFromAssistantCommands([buildToolResultCommandWithoutName()]);

    const content = toMessageContent(messages[0]?.content as MessageContent);
    if (typeof content === "string") {
      throw new Error("Expected structured content");
    }
    const parts = content.parts ?? [];
    expect(parts[0]?.type).toBe("tool-result");
    expect((parts[0] as { toolName?: string }).toolName).toBe("tool");
  });

  it("coerces invalid tool-call args into null values", () => {
    const payload = {
      commands: [buildToolCallWithInvalidArgs()],
    };
    const parsed = parseAssistantTransportRequest(payload);
    const messages = toCoreMessagesFromAssistantCommands(parsed?.commands ?? []);

    const content = toMessageContent(messages[0]?.content as MessageContent);
    if (typeof content === "string") {
      throw new Error("Expected structured content");
    }
    const parts = content.parts ?? [];
    const toolCall = parts[0] as { input?: Record<string, unknown> };
    expect(toolCall.input?.invalid).toBeNull();
  });

  it("accepts data payloads and ignores invalid data", () => {
    const payload = {
      commands: [buildTextCommand("hi")],
      data: "not-record",
    };

    const result = parseAssistantTransportRequest(payload);

    expect(result?.data?.recipeId).toBeUndefined();
  });
});
