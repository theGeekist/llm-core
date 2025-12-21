import { describe, expect, it } from "bun:test";
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { ChatMessage } from "@llamaindex/core/llms";
import type { ModelMessage, TextPart } from "ai";
import { fromAiSdkMessage, fromLangChainMessage, fromLlamaIndexMessage } from "#adapters";

describe("Adapter messages", () => {
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
    const message: ModelMessage = {
      role: "user",
      content: "hi",
    };

    expect(fromAiSdkMessage(message)).toEqual({ role: "user", content: "hi" });
  });

  it("maps AI SDK tool messages", () => {
    const message = {
      role: "tool",
      content: [{ type: "text", text: "tool output" }],
    } as unknown as ModelMessage;

    const adapted = fromAiSdkMessage(message);
    expect(adapted.role).toBe("tool");
    expect(adapted.content).toMatchObject({ text: "tool output" });
  });

  it("falls back when AI SDK message has no content", () => {
    const message = { role: "tool" } as unknown as ModelMessage;
    expect(fromAiSdkMessage(message)).toEqual({ role: "tool", content: "" });
  });

  it("maps AI SDK system messages", () => {
    const message: ModelMessage = {
      role: "system",
      content: "system",
    };

    expect(fromAiSdkMessage(message)).toEqual({ role: "system", content: "system" });
  });

  it("maps AI SDK assistant messages", () => {
    const message: ModelMessage = {
      role: "assistant",
      content: "assistant",
    };

    expect(fromAiSdkMessage(message)).toEqual({ role: "assistant", content: "assistant" });
  });

  it("maps AI SDK structured messages", () => {
    const content: TextPart[] = [{ type: "text", text: "hi" }];
    const message: ModelMessage = {
      role: "user",
      content,
    };

    const adapted = fromAiSdkMessage(message);
    expect(adapted.content).toMatchObject({ text: "hi" });
  });

  it("maps LlamaIndex developer and memory roles", () => {
    const developer: ChatMessage = { role: "developer", content: "note" };
    const memory: ChatMessage = { role: "memory", content: "memo" };

    expect(fromLlamaIndexMessage(developer)).toEqual({ role: "system", content: "note" });
    expect(fromLlamaIndexMessage(memory)).toEqual({ role: "system", content: "memo" });
  });

  it("maps LlamaIndex tool role to tool", () => {
    const tool = { role: "tool", content: "result" } as unknown as ChatMessage;
    expect(fromLlamaIndexMessage(tool)).toEqual({ role: "tool", content: "result" });
  });
});
