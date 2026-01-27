import { describe, expect, it } from "bun:test";
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { ChatMessage } from "@llamaindex/core/llms";
import type { TextPart } from "ai";
import { fromAiSdkMessage, fromLangChainMessage, fromLlamaIndexMessage } from "#adapters";
import { toAiSdkMessage } from "../../src/adapters/ai-sdk/messages";
import { toLangChainMessage } from "../../src/adapters/langchain/messages";
import { toLlamaIndexMessage } from "../../src/adapters/llamaindex/messages";
import { asAiSdkMessage, asLlamaChatMessage } from "./helpers";

describe("Adapter messages", () => {
  const TOOL_NAME = "search";
  const TOOL_ECHO = "echo";
  const TOOL_CALL_TYPE = "tool-call";
  const TOOL_RESULT_TYPE = "tool-result";
  const TOOL_CALL_ID = "call-1";
  it("maps LangChain messages", () => {
    const human = new HumanMessage("hi");
    const ai = new AIMessage("hello");
    const system = new SystemMessage("system");

    expect(fromLangChainMessage(human)).toEqual({ role: "user", content: "hi" });
    expect(fromLangChainMessage(ai)).toEqual({ role: "assistant", content: "hello" });
    expect(fromLangChainMessage(system)).toEqual({ role: "system", content: "system" });
  });

  it("maps LlamaIndex messages", () => {
    const message: ChatMessage = {
      role: "user",
      content: "hello",
    };

    expect(fromLlamaIndexMessage(message)).toEqual({ role: "user", content: "hello" });
  });

  it("maps AI SDK messages", () => {
    const message = asAiSdkMessage({
      role: "user",
      content: "hi",
    });

    expect(fromAiSdkMessage(message)).toEqual({ role: "user", content: "hi" });
  });

  it("maps AI SDK tool messages", () => {
    const message = asAiSdkMessage({
      role: "tool",
      content: [{ type: "text", text: "tool output" }],
    });

    const adapted = fromAiSdkMessage(message);
    expect(adapted.role).toBe("tool");
    expect(adapted.content).toMatchObject({ text: "tool output" });
  });

  it("falls back when AI SDK message has no content", () => {
    const message = asAiSdkMessage({ role: "tool" });
    expect(fromAiSdkMessage(message)).toEqual({ role: "tool", content: "" });
  });

  it("maps AI SDK system messages", () => {
    const message = asAiSdkMessage({
      role: "system",
      content: "system",
    });

    expect(fromAiSdkMessage(message)).toEqual({ role: "system", content: "system" });
  });

  it("maps AI SDK assistant messages", () => {
    const message = asAiSdkMessage({
      role: "assistant",
      content: "assistant",
    });

    expect(fromAiSdkMessage(message)).toEqual({ role: "assistant", content: "assistant" });
  });

  it("maps AI SDK structured messages", () => {
    const content: TextPart[] = [{ type: "text", text: "hi" }];
    const message = asAiSdkMessage({
      role: "user",
      content,
    });

    const adapted = fromAiSdkMessage(message);
    expect(adapted.content).toMatchObject({ text: "hi" });
  });

  it("maps adapter tool content to AI SDK tool results", () => {
    const message = toAiSdkMessage({
      role: "tool",
      content: "ok",
      toolCallId: TOOL_CALL_ID,
      name: TOOL_ECHO,
    });

    expect(message.role).toBe("tool");
    expect(message.content as unknown).toEqual([
      {
        type: TOOL_RESULT_TYPE,
        toolCallId: TOOL_CALL_ID,
        toolName: TOOL_ECHO,
        output: "ok",
      },
    ]);
  });

  it("maps adapter assistant tool parts to AI SDK tool calls", () => {
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
    expect(parts.find((part) => part.type === TOOL_CALL_TYPE)?.toolName).toBe(TOOL_NAME);
    expect(parts.find((part) => part.type === TOOL_RESULT_TYPE)?.toolName).toBe(TOOL_NAME);
  });

  it("reads AI SDK tool metadata from tool results", () => {
    const message = asAiSdkMessage({
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "call-2",
          toolName: "calc",
          output: "ok",
        },
      ],
    });

    const adapted = fromAiSdkMessage(message);
    expect(adapted.role).toBe("tool");
    expect(adapted.toolCallId).toBe("call-2");
    expect(adapted.name).toBe("calc");
  });

  it("maps LlamaIndex developer and memory roles", () => {
    const developer: ChatMessage = { role: "developer", content: "note" };
    const memory: ChatMessage = { role: "memory", content: "memo" };

    expect(fromLlamaIndexMessage(developer)).toEqual({ role: "system", content: "note" });
    expect(fromLlamaIndexMessage(memory)).toEqual({ role: "system", content: "memo" });
  });

  it("maps LlamaIndex tool role to tool", () => {
    const tool = asLlamaChatMessage({ role: "tool", content: "result" });
    expect(fromLlamaIndexMessage(tool)).toEqual({ role: "tool", content: "result" });
  });

  it("preserves tool parts when mapping to LangChain messages", () => {
    const message = toLangChainMessage({
      role: "assistant",
      content: {
        text: "",
        parts: [
          { type: TOOL_CALL_TYPE, toolName: TOOL_NAME, input: { q: "ok" } },
          { type: TOOL_RESULT_TYPE, toolName: TOOL_NAME, output: { hit: true } },
        ],
      },
    });

    const content = "content" in message ? message.content : "";
    const text =
      typeof content === "string"
        ? content
        : content.map((part) => ("text" in part ? part.text : "")).join(" ");
    expect(text).toContain(`${TOOL_CALL_TYPE}:${TOOL_NAME}`);
    expect(text).toContain(`${TOOL_RESULT_TYPE}:${TOOL_NAME}`);
  });

  it("summarizes adapter image parts for LangChain messages", () => {
    const message = toLangChainMessage({
      role: "user",
      content: {
        text: "",
        parts: [
          { type: "image", data: "abc123", mediaType: "image/png" },
          { type: "data", data: { ok: true } },
        ],
      },
    });

    const content = "content" in message ? message.content : "";
    const parts = Array.isArray(content) ? content : [];
    const image = parts.find((part) => part.type === "image_url");
    const imageUrl = image as { image_url?: { url?: string } } | undefined;
    expect(imageUrl?.image_url?.url).toContain("data:image/png;base64,abc123");
  });

  it("preserves tool parts when mapping to LlamaIndex messages", () => {
    const message = toLlamaIndexMessage({
      role: "assistant",
      content: {
        text: "",
        parts: [
          { type: TOOL_CALL_TYPE, toolName: TOOL_NAME, input: { q: "ok" } },
          { type: TOOL_RESULT_TYPE, toolName: TOOL_NAME, output: { hit: true } },
        ],
      },
    });

    const content = message.content;
    const text =
      typeof content === "string"
        ? content
        : content.map((part) => ("text" in part ? part.text : "")).join(" ");
    expect(text).toContain(`${TOOL_CALL_TYPE}:${TOOL_NAME}`);
    expect(text).toContain(`${TOOL_RESULT_TYPE}:${TOOL_NAME}`);
  });

  it("maps tool messages into LlamaIndex options", () => {
    const message = toLlamaIndexMessage({
      role: "tool",
      name: TOOL_NAME,
      toolCallId: "call-3",
      content: "ok",
    });

    expect(message.options).toMatchObject({
      adapterRole: "tool",
      toolCallId: "call-3",
      toolName: TOOL_NAME,
    });
  });

  it("maps file parts into LlamaIndex message content", () => {
    const message = toLlamaIndexMessage({
      role: "assistant",
      content: {
        text: "",
        parts: [{ type: "file", data: "payload", mediaType: "text/plain" }],
      },
    });

    const parts = Array.isArray(message.content) ? message.content : [];
    expect(parts[0]).toMatchObject({ type: "file", mimeType: "text/plain" });
  });
});
