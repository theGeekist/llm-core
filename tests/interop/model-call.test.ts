import { describe, expect, it } from "bun:test";
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { ChatMessage } from "@llamaindex/core/llms";
import type { Prompt } from "ai";
import type { ModelCall } from "#adapters";

const toModelCallFromLangChain = (
  messages: Array<HumanMessage | AIMessage | SystemMessage>,
): ModelCall => ({
  messages: messages.map((message) => ({
    role: langChainRoleToAdapter(message.type),
    content: message.text,
  })),
});

const langChainRoleToAdapter = (role: string): "system" | "user" | "assistant" | "tool" => {
  if (role === "human") {
    return "user";
  }
  if (role === "ai") {
    return "assistant";
  }
  if (role === "system") {
    return "system";
  }
  return "tool";
};

const toModelCallFromLlama = (messages: ChatMessage[]): ModelCall => ({
  messages: messages.map((message) => ({
    role: message.role === "memory" || message.role === "developer" ? "system" : message.role,
    content: typeof message.content === "string" ? message.content : "",
  })),
});

const toModelCallFromAiSdk = (prompt: Prompt): ModelCall => {
  if ("messages" in prompt && prompt.messages) {
    return {
      messages: prompt.messages.map((message) => ({
        role: message.role === "tool" ? "tool" : message.role,
        content: typeof message.content === "string" ? message.content : "",
      })),
      system: prompt.system,
    };
  }
  return {
    prompt: typeof prompt.prompt === "string" ? prompt.prompt : "",
    system: prompt.system,
  };
};

describe("Interop model calls", () => {
  it("maps LangChain messages to ModelCall", () => {
    const messages = [new HumanMessage("hi"), new AIMessage("hello"), new SystemMessage("system")];
    const call = toModelCallFromLangChain(messages);

    expect(call.messages?.[0]?.role).toBe("user");
    expect(call.messages?.[1]?.role).toBe("assistant");
    expect(call.messages?.[2]?.role).toBe("system");
  });

  it("maps LlamaIndex messages to ModelCall", () => {
    const messages: ChatMessage[] = [{ role: "user", content: "hello" }];
    const call = toModelCallFromLlama(messages);

    expect(call.messages?.[0]?.content).toBe("hello");
  });

  it("maps AI SDK prompts to ModelCall", () => {
    const prompt: Prompt = {
      system: "system",
      prompt: "hello",
    };

    const call = toModelCallFromAiSdk(prompt);
    expect("prompt" in call).toBe(true);
  });
});
