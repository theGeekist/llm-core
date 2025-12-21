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

  it("maps AI SDK structured messages", () => {
    const content: TextPart[] = [{ type: "text", text: "hi" }];
    const message: ModelMessage = {
      role: "user",
      content,
    };

    const adapted = fromAiSdkMessage(message);
    expect(adapted.content).toMatchObject({ text: "hi" });
  });
});
