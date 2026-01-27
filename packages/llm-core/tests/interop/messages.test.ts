import { describe, expect, it } from "bun:test";
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { ChatMessage } from "@llamaindex/core/llms";
import type { ModelMessage } from "ai";
import type { Message } from "#workflow";

const toMessageFromLangChain = (message: HumanMessage | AIMessage | SystemMessage): Message => ({
  role: langChainRoleToAdapter(message.type),
  content: message.text,
});

const langChainRoleToAdapter = (role: string): Message["role"] => {
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

const toMessageFromLlama = (message: ChatMessage): Message => ({
  role: llamaRoleToAdapter(message.role),
  content: typeof message.content === "string" ? message.content : "",
});

const llamaRoleToAdapter = (role: ChatMessage["role"]): Message["role"] => {
  if (role === "user") {
    return "user";
  }
  if (role === "assistant") {
    return "assistant";
  }
  if (role === "system" || role === "developer" || role === "memory") {
    return "system";
  }
  return "tool";
};

const toMessageFromAiSdk = (message: ModelMessage): Message => {
  if (message.role === "system") {
    return { role: "system", content: message.content };
  }
  if (message.role === "user") {
    return {
      role: "user",
      content: typeof message.content === "string" ? message.content : "",
    };
  }
  if (message.role === "assistant") {
    return {
      role: "assistant",
      content: typeof message.content === "string" ? message.content : "",
    };
  }
  return { role: "tool", content: "" };
};

describe("Interop messages", () => {
  it("maps LangChain messages to Message", () => {
    const human = new HumanMessage("hi");
    const ai = new AIMessage("hello");
    const system = new SystemMessage("system");

    expect(toMessageFromLangChain(human)).toEqual({ role: "user", content: "hi" });
    expect(toMessageFromLangChain(ai)).toEqual({ role: "assistant", content: "hello" });
    expect(toMessageFromLangChain(system)).toEqual({ role: "system", content: "system" });
  });

  it("maps LlamaIndex messages to Message", () => {
    const message: ChatMessage = {
      role: "user",
      content: "hello",
    };

    expect(toMessageFromLlama(message)).toEqual({ role: "user", content: "hello" });
  });

  it("maps AI SDK messages to Message", () => {
    const message: ModelMessage = {
      role: "user",
      content: "hi",
    };

    expect(toMessageFromAiSdk(message)).toEqual({ role: "user", content: "hi" });
  });
});
