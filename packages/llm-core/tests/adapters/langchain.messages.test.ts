import { describe, expect, it } from "bun:test";
import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import { fromLangChainMessage } from "#adapters";
import { toLangChainMessage } from "../../src/adapters/langchain/messages";

describe("Adapter LangChain message conversions", () => {
  const TOOL_NAME = "search";
  const IMAGE_URL = "https://example.com/ok.png";
  const TEXT_MEDIA = "text/plain";

  it("maps tool messages with ids and names", () => {
    const message = new ToolMessage({
      content: "ok",
      tool_call_id: "call-1",
      name: TOOL_NAME,
    });

    const adapted = fromLangChainMessage(message);
    expect(adapted.role).toBe("tool");
    expect(adapted.toolCallId).toBe("call-1");
    expect(adapted.name).toBe(TOOL_NAME);
  });

  it("maps human, ai, and system messages to adapter roles", () => {
    const human = fromLangChainMessage(new HumanMessage("hi"));
    const ai = fromLangChainMessage(new AIMessage("ok"));
    const system = fromLangChainMessage(new SystemMessage("sys"));

    expect(human.role).toBe("user");
    expect(ai.role).toBe("assistant");
    expect(system.role).toBe("system");
  });

  it("summarizes tool parts for tool messages", () => {
    const message = toLangChainMessage({
      role: "tool",
      toolCallId: "call-2",
      name: TOOL_NAME,
      content: {
        text: "",
        parts: [
          { type: "tool-call", toolName: TOOL_NAME, input: { q: "hi" } },
          { type: "tool-result", toolName: TOOL_NAME, output: { ok: true } },
        ],
      },
    });

    expect(message.content).toContain(`tool-call:${TOOL_NAME}`);
    expect(message.content).toContain(`tool-result:${TOOL_NAME}`);
  });

  it("uses plain text when tool content provides text", () => {
    const message = toLangChainMessage({
      role: "tool",
      content: {
        text: "plain",
        parts: [],
      },
    });

    expect(message.content).toBe("plain");
  });

  it("maps image parts to data urls when needed", () => {
    const message = toLangChainMessage({
      role: "user",
      content: {
        text: "",
        parts: [
          { type: "image", data: "abc", mediaType: "image/png" },
          { type: "image", url: IMAGE_URL },
        ],
      },
    });

    const content = "content" in message ? message.content : "";
    const parts = Array.isArray(content) ? content : [];
    const image = parts.find((part) => part.type === "image_url");
    const imageUrl = image as { image_url?: { url?: string } } | undefined;
    expect(imageUrl?.image_url?.url).toContain("data:image/png;base64,abc");
    expect(
      parts.some(
        (part) =>
          part.type === "image_url" &&
          (part as { image_url?: { url?: string } }).image_url?.url === IMAGE_URL,
      ),
    ).toBe(true);
  });

  it("summarizes mixed parts into plain text", () => {
    const cyclic: { ref?: unknown } = {};
    cyclic.ref = cyclic;
    const message = toLangChainMessage({
      role: "tool",
      content: {
        text: "",
        parts: [
          { type: "reasoning", text: "think" },
          { type: "file", data: "payload", mediaType: TEXT_MEDIA },
          { type: "data", data: { ok: true } },
          { type: "data", data: cyclic },
        ],
      },
    });

    expect(message.content).toContain(`file:${TEXT_MEDIA}`);
    expect(message.content).toContain('{"ok":true}');
  });

  it("maps assistant messages with structured parts", () => {
    const message = toLangChainMessage({
      role: "assistant",
      content: {
        text: "",
        parts: [
          { type: "text", text: "hi" },
          { type: "image", url: "https://example.com/ok.png" },
        ],
      },
    });

    const content = "content" in message ? message.content : "";
    const parts = Array.isArray(content) ? content : [];
    expect(parts.some((part) => part.type === "text")).toBe(true);
    expect(parts.some((part) => part.type === "image_url")).toBe(true);
  });

  it("maps unknown message types to tool role", () => {
    const message = {
      type: "tool",
      content: "ok",
      text: "ok",
    } as unknown as import("@langchain/core/messages").BaseMessage;

    const adapted = fromLangChainMessage(message as unknown as never);
    expect(adapted.role).toBe("tool");
  });
});
