import { describe, expect, it } from "bun:test";
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { ChatMessage } from "@llamaindex/core/llms";
import type { ModelMessage, Prompt } from "ai";
import { fromAiSdkPrompt, fromLangChainMessages, fromLlamaIndexMessages } from "#adapters";

describe("Adapter model calls", () => {
  it("maps LangChain messages to AdapterModelCall", () => {
    const messages = [new HumanMessage("hi"), new AIMessage("hello"), new SystemMessage("sys")];
    const call = fromLangChainMessages(messages);

    expect(call.messages?.[0]?.role).toBe("user");
    expect(call.messages?.[1]?.role).toBe("assistant");
    expect(call.messages?.[2]?.role).toBe("system");
  });

  it("maps LlamaIndex messages to AdapterModelCall", () => {
    const messages: ChatMessage[] = [{ role: "user", content: "hello" }];
    const call = fromLlamaIndexMessages(messages);
    expect(call.messages?.[0]?.content).toBe("hello");
  });

  it("maps AI SDK prompts to AdapterModelCall", () => {
    const prompt: Prompt = {
      system: "system",
      prompt: "hello",
    };

    const call = fromAiSdkPrompt(prompt);
    expect("prompt" in call).toBe(true);
  });

  it("maps AI SDK string prompts", () => {
    const call = fromAiSdkPrompt("hello" as unknown as Prompt);
    expect("prompt" in call).toBe(true);
  });

  it("prefers AI SDK messages when provided", () => {
    const message: ModelMessage = { role: "user", content: "hi" };
    const prompt: Prompt = {
      system: "system",
      messages: [message],
    };

    const call = fromAiSdkPrompt(prompt);
    expect("messages" in call).toBe(true);
  });

  it("falls back when AI SDK messages are empty", () => {
    const prompt = {
      system: "system",
      messages: [],
      prompt: "fallback",
    } as unknown as Prompt;

    const call = fromAiSdkPrompt(prompt);
    expect("prompt" in call).toBe(true);
  });

  it("maps AI SDK prompt arrays to messages", () => {
    const prompt: Prompt = {
      system: "system",
      prompt: [{ role: "user", content: "hello" } satisfies ModelMessage],
    };

    const call = fromAiSdkPrompt(prompt);
    expect("messages" in call).toBe(true);
  });
});
