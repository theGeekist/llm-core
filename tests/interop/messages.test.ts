import { describe, expect, it } from "bun:test";
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { ChatMessage } from "@llamaindex/core/llms";
import type { ModelMessage } from "ai";
import type { AdapterMessage } from "#workflow";

const toAdapterMessageFromLangChain = (
  message: HumanMessage | AIMessage | SystemMessage,
): AdapterMessage => ({
  role: langChainRoleToAdapter(message.type),
  content: message.text,
});

const langChainRoleToAdapter = (role: string): AdapterMessage["role"] => {
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

const toAdapterMessageFromLlama = (message: ChatMessage): AdapterMessage => ({
  role: llamaRoleToAdapter(message.role),
  content: typeof message.content === "string" ? message.content : "",
});

const llamaRoleToAdapter = (role: ChatMessage["role"]): AdapterMessage["role"] => {
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

const toAdapterMessageFromAiSdk = (message: ModelMessage): AdapterMessage => {
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
  it("maps LangChain messages to AdapterMessage", () => {
    const human = new HumanMessage("hi");
    const ai = new AIMessage("hello");
    const system = new SystemMessage("system");

    expect(toAdapterMessageFromLangChain(human)).toEqual({ role: "user", content: "hi" });
    expect(toAdapterMessageFromLangChain(ai)).toEqual({ role: "assistant", content: "hello" });
    expect(toAdapterMessageFromLangChain(system)).toEqual({ role: "system", content: "system" });
  });

  it("maps LlamaIndex messages to AdapterMessage", () => {
    const message: ChatMessage = {
      role: "user",
      content: "hello",
    };

    expect(toAdapterMessageFromLlama(message)).toEqual({ role: "user", content: "hello" });
  });

  it("maps AI SDK messages to AdapterMessage", () => {
    const message: ModelMessage = {
      role: "user",
      content: "hi",
    };

    expect(toAdapterMessageFromAiSdk(message)).toEqual({ role: "user", content: "hi" });
  });
});
