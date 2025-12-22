import { describe, expect, it } from "bun:test";
import type { ChatMessage } from "@llamaindex/core/llms";
import { fromLlamaIndexMessage } from "#adapters";
import { toLlamaIndexMessage } from "../../src/adapters/llamaindex/messages";

describe("Adapter LlamaIndex message conversions", () => {
  const TOOL_NAME = "search";
  const IMAGE_URL = "https://example.com/ok.png";
  const IMAGE_MEDIA = "image/png";
  const TEXT_MEDIA = "text/plain";
  it("reads tool metadata from message options", () => {
    const message: ChatMessage = {
      role: "assistant",
      content: "ok",
      options: {
        adapterRole: "tool",
        toolCallId: "call-1",
        toolName: TOOL_NAME,
      },
    };

    const adapted = fromLlamaIndexMessage(message);
    expect(adapted.role).toBe("tool");
    expect(adapted.toolCallId).toBe("call-1");
    expect(adapted.name).toBe(TOOL_NAME);
  });

  it("ignores non-object options when reading tool metadata", () => {
    const message: ChatMessage = {
      role: "user",
      content: "hi",
      options: "not-an-object" as unknown as ChatMessage["options"],
    };

    const adapted = fromLlamaIndexMessage(message);
    expect(adapted.role).toBe("user");
    expect(adapted.toolCallId).toBeUndefined();
  });

  it("maps tool messages into LlamaIndex options", () => {
    const message = toLlamaIndexMessage({
      role: "tool",
      name: TOOL_NAME,
      toolCallId: "call-2",
      content: "ok",
    });

    expect(message.options).toMatchObject({
      adapterRole: "tool",
      toolCallId: "call-2",
      toolName: TOOL_NAME,
    });
  });

  it("maps image and file parts to message content", () => {
    const message = toLlamaIndexMessage({
      role: "assistant",
      content: {
        text: "",
        parts: [
          { type: "image", data: "abc", mediaType: IMAGE_MEDIA },
          { type: "image", url: IMAGE_URL },
          { type: "file", data: "payload", mediaType: TEXT_MEDIA },
        ],
      },
    });

    const parts = Array.isArray(message.content) ? message.content : [];
    expect(parts[0]).toMatchObject({ type: "image", mimeType: IMAGE_MEDIA });
    expect(parts[1]).toMatchObject({ type: "image_url", image_url: { url: IMAGE_URL } });
    expect(parts[2]).toMatchObject({ type: "file", mimeType: TEXT_MEDIA });
  });

  it("maps text and reasoning parts into message content", () => {
    const message = toLlamaIndexMessage({
      role: "assistant",
      content: {
        text: "",
        parts: [
          { type: "text", text: "hi" },
          { type: "reasoning", text: "think" },
        ],
      },
    });

    const parts = Array.isArray(message.content) ? message.content : [];
    expect(parts[0]).toMatchObject({ type: "text", text: "hi" });
    expect(parts[1]).toMatchObject({ type: "text", text: "think" });
  });

  it("summarizes file parts without data", () => {
    const message = toLlamaIndexMessage({
      role: "assistant",
      content: {
        text: "",
        parts: [{ type: "file", data: "", mediaType: "text/plain" }],
      },
    });

    const parts = Array.isArray(message.content) ? message.content : [];
    expect(parts[0]).toMatchObject({ type: "text" });
  });

  it("summarizes image parts without payloads", () => {
    const message = toLlamaIndexMessage({
      role: "assistant",
      content: {
        text: "",
        parts: [{ type: "image" }],
      },
    });

    const parts = Array.isArray(message.content) ? message.content : [];
    expect(parts[0]).toMatchObject({ type: "text" });
  });

  it("summarizes unsupported parts into text entries", () => {
    const cyclic: { ref?: unknown } = {};
    cyclic.ref = cyclic;
    const message = toLlamaIndexMessage({
      role: "assistant",
      content: {
        text: "",
        parts: [
          { type: "tool-call", toolName: TOOL_NAME, input: { q: "hi" } },
          { type: "tool-result", toolName: TOOL_NAME, output: { ok: true } },
          { type: "data", data: { ok: true } },
          { type: "data", data: cyclic },
        ],
      },
    });

    const parts = Array.isArray(message.content) ? message.content : [];
    const textParts = parts.filter((part) => part.type === "text");
    expect(textParts.length).toBeGreaterThan(0);
  });
});
