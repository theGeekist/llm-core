import { describe, expect, it } from "bun:test";
import type { AssistantTransportCommand, MessageContent } from "#adapters";
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

const buildImageCommand = (): AssistantTransportCommand => ({
  type: "add-message",
  message: {
    role: "user",
    parts: [{ type: "image", image: "https://example.com/image.png" }],
  },
});

const buildAssistantCommand = (): AssistantTransportCommand => ({
  type: "add-message",
  message: {
    role: "assistant",
    parts: [
      { type: "text", text: "first" },
      { type: "text", text: "second" },
    ],
  },
});

const buildToolResultCommand = (): AssistantTransportCommand => ({
  type: "add-tool-result",
  toolCallId: "call-1",
  toolName: "search",
  result: { ok: true },
  isError: false,
  artifact: { source: "assistant-ui" },
});

const asCommand = (value: unknown) => value as AssistantTransportCommand;

describe("assistant-ui transport", () => {
  it("parses valid assistant transport payloads and llm-core data", () => {
    const payload = {
      commands: [buildTextCommand("hi")],
      data: {
        recipeId: "chat.simple",
        adapterSource: "assistant-ui",
        providerId: "openai",
        modelId: "gpt-4o-mini",
        chatId: "chat-1",
      },
    };

    const result = parseAssistantTransportRequest(payload);

    expect(result).not.toBeNull();
    expect(result?.commands.length).toBe(1);
    expect(result?.data).toEqual(payload.data);
  });

  it("rejects invalid request envelopes", () => {
    expect(parseAssistantTransportRequest(null)).toBeNull();
    expect(parseAssistantTransportRequest({})).toBeNull();
    expect(parseAssistantTransportRequest({ commands: [123] })).toBeNull();
  });

  it("maps current Assistant UI message and tool-result commands to core messages", () => {
    const messages = toCoreMessagesFromAssistantCommands([
      buildTextCommand("Hello"),
      buildImageCommand(),
      buildAssistantCommand(),
      buildToolResultCommand(),
    ]);
    const imageContent = toMessageContent(messages[1]?.content as MessageContent);
    const assistantContent = toMessageContent(messages[2]?.content as MessageContent);
    const toolContent = toMessageContent(messages[3]?.content as MessageContent);
    if (
      typeof imageContent === "string" ||
      typeof assistantContent === "string" ||
      typeof toolContent === "string"
    ) {
      throw new Error("Expected structured content");
    }

    expect(messages.length).toBe(4);
    expect(messages[0]?.role).toBe("user");
    expect(imageContent.parts?.[0]).toEqual({
      type: "image",
      url: "https://example.com/image.png",
    });
    expect(assistantContent.text).toBe("first\nsecond");
    expect(toolContent.parts?.[0]).toEqual({
      type: "tool-result",
      toolCallId: "call-1",
      toolName: "search",
      output: { ok: true },
      isError: false,
    });
    expect(messages[3]?.metadata).toEqual({
      assistantUi: { artifact: { source: "assistant-ui" } },
    });
  });

  it("restricts add-message roles and parts to the current dependency contract", () => {
    const invalidRole = {
      commands: [
        {
          type: "add-message",
          message: { role: "tool", parts: [{ type: "text", text: "hi" }] },
        },
      ],
    };
    const invalidUserPart = {
      commands: [
        {
          type: "add-message",
          message: {
            role: "user",
            parts: [{ type: "tool-call", toolName: "lookup", toolCallId: "call-1" }],
          },
        },
      ],
    };
    const invalidAssistantPart = {
      commands: [
        {
          type: "add-message",
          message: {
            role: "assistant",
            parts: [{ type: "image", image: "https://example.com/image.png" }],
          },
        },
      ],
    };
    const invalidImage = {
      commands: [
        {
          type: "add-message",
          message: { role: "user", parts: [{ type: "image", image: 123 }] },
        },
      ],
    };

    expect(parseAssistantTransportRequest(invalidRole)).toBeNull();
    expect(parseAssistantTransportRequest(invalidUserPart)).toBeNull();
    expect(parseAssistantTransportRequest(invalidAssistantPart)).toBeNull();
    expect(parseAssistantTransportRequest(invalidImage)).toBeNull();
  });

  it("requires every current tool-result field", () => {
    const valid = buildToolResultCommand();
    const missingId = { ...valid, toolCallId: undefined };
    const missingName = { ...valid, toolName: undefined };
    const missingResult = { ...valid, result: undefined };
    const missingError = { ...valid, isError: undefined };

    expect(parseAssistantTransportRequest({ commands: [asCommand(missingId)] })).toBeNull();
    expect(parseAssistantTransportRequest({ commands: [asCommand(missingName)] })).toBeNull();
    expect(parseAssistantTransportRequest({ commands: [asCommand(missingResult)] })).toBeNull();
    expect(parseAssistantTransportRequest({ commands: [asCommand(missingError)] })).toBeNull();
  });

  it("preserves valid tool-result artifacts and rejects non-JSON payloads", () => {
    const command = buildToolResultCommand();
    const parsed = parseAssistantTransportRequest({ commands: [command] });
    const parsedCommand = parsed?.commands[0];

    expect(parsedCommand?.type).toBe("add-tool-result");
    if (parsedCommand?.type === "add-tool-result") {
      expect(parsedCommand.artifact).toEqual({ source: "assistant-ui" });
    }

    expect(
      parseAssistantTransportRequest({
        commands: [asCommand({ ...command, result: () => null })],
      }),
    ).toBeNull();
    expect(
      parseAssistantTransportRequest({
        commands: [asCommand({ ...command, artifact: () => null })],
      }),
    ).toBeNull();
  });

  it("accepts absent artifacts and ignores invalid llm-core data", () => {
    const command = { ...buildToolResultCommand(), artifact: undefined };
    const result = parseAssistantTransportRequest({
      commands: [command],
      data: "not-record",
    });

    expect(result?.commands[0]).toEqual(command);
    expect(result?.data?.recipeId).toBeUndefined();
  });
});
