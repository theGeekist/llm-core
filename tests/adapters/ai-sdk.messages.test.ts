import { describe, expect, it } from "bun:test";
import { toAiSdkMessage } from "../../src/adapters/ai-sdk/messages";
import { fromAiSdkMessage } from "#adapters";
import { asAiSdkMessage, makeStructuredContent } from "./helpers";

describe("Adapter AI SDK message conversions", () => {
  const FALLBACK_TEXT = "fallback";
  const TOOL_NAME = "search";
  const TOOL_CALL_TYPE = "tool-call";
  const TOOL_RESULT_TYPE = "tool-result";
  it("maps structured system content to plain text", () => {
    const message = toAiSdkMessage({
      role: "system",
      content: makeStructuredContent([], "system"),
    });

    expect(message).toEqual({ role: "system", content: "system" });
  });

  it("maps user and assistant strings directly", () => {
    const user = toAiSdkMessage({ role: "user", content: "hello" });
    const assistant = toAiSdkMessage({ role: "assistant", content: "hi" });

    expect(user).toEqual({ role: "user", content: "hello" });
    expect(assistant).toEqual({ role: "assistant", content: "hi" });
  });

  it("maps user content parts into AI SDK parts", () => {
    const message = toAiSdkMessage({
      role: "user",
      content: {
        text: "",
        parts: [
          { type: "text", text: "hello" },
          { type: "image", data: "abc", mediaType: "image/png" },
          { type: "file", data: "payload", mediaType: "text/plain" },
        ],
      },
    });

    expect(Array.isArray(message.content)).toBe(true);
  });

  it("falls back to text when user parts are unsupported", () => {
    const message = toAiSdkMessage({
      role: "user",
      content: {
        text: FALLBACK_TEXT,
        parts: [{ type: "reasoning", text: "note" }],
      },
    });

    expect(message.content).toBe(FALLBACK_TEXT);
  });

  it("falls back to text when assistant parts are unsupported", () => {
    const message = toAiSdkMessage({
      role: "assistant",
      content: {
        text: FALLBACK_TEXT,
        parts: [{ type: "data", data: { ok: true } }],
      },
    });

    expect(message.content).toBe(FALLBACK_TEXT);
  });

  it("maps assistant tool parts into AI SDK content", () => {
    const message = toAiSdkMessage({
      role: "assistant",
      content: {
        text: "",
        parts: [
          { type: TOOL_CALL_TYPE, toolName: TOOL_NAME, input: { q: "hi" } },
          { type: TOOL_RESULT_TYPE, toolName: TOOL_NAME, output: { ok: true } },
        ],
      },
    });

    const content = "content" in message ? message.content : "";
    const parts = Array.isArray(content) ? content : [];
    expect(parts.some((part) => part.type === TOOL_CALL_TYPE)).toBe(true);
    expect(parts.some((part) => part.type === TOOL_RESULT_TYPE)).toBe(true);
  });

  it("maps assistant reasoning and image parts into AI SDK content", () => {
    const message = toAiSdkMessage({
      role: "assistant",
      content: {
        text: "",
        parts: [
          { type: "reasoning", text: "think" },
          { type: "image", data: "abc", mediaType: "image/png" },
          { type: "file", data: "payload", mediaType: "text/plain" },
        ],
      },
    });

    const content = "content" in message ? message.content : "";
    const parts = Array.isArray(content) ? content : [];
    expect(parts.some((part) => part.type === "reasoning")).toBe(true);
  });

  it("maps tool content without tool parts to a fallback tool result", () => {
    const message = toAiSdkMessage({
      role: "tool",
      content: {
        text: FALLBACK_TEXT,
        parts: [{ type: "text", text: FALLBACK_TEXT }],
      },
    });

    expect(message.content as unknown).toEqual([
      {
        type: TOOL_RESULT_TYPE,
        toolCallId: "tool",
        toolName: "tool",
        output: FALLBACK_TEXT,
      },
    ]);
  });

  it("fills tool metadata for tool parts when missing", () => {
    const message = toAiSdkMessage({
      role: "tool",
      toolCallId: "call-2",
      name: TOOL_NAME,
      content: {
        text: "",
        parts: [{ type: TOOL_RESULT_TYPE, toolName: "", output: { ok: true } }],
      },
    });

    expect(message.content as unknown).toEqual([
      {
        type: TOOL_RESULT_TYPE,
        toolCallId: "call-2",
        toolName: TOOL_NAME,
        output: { ok: true },
      },
    ]);
  });

  it("maps AI SDK assistant messages with structured content", () => {
    const message = asAiSdkMessage({
      role: "assistant",
      content: [{ type: "text", text: "hi" }],
    });

    const adapted = fromAiSdkMessage(message);
    expect(adapted.role).toBe("assistant");
    expect(adapted.content).toMatchObject({ text: "hi" });
  });

  it("skips tool metadata when tool content is not an array", () => {
    const message = asAiSdkMessage({
      role: "tool",
      content: "ok",
    });

    const adapted = fromAiSdkMessage(message);
    expect(adapted.toolCallId).toBeUndefined();
    expect(adapted.name).toBeUndefined();
  });
});
