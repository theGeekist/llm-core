import { describe, expect, it } from "bun:test";
import { AIMessage, ToolMessage } from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { Tool, toAdapterSchema } from "#adapters";
import { fromLangChainModel } from "#adapters";

const createModel = (handler: (messages: unknown, options?: unknown) => unknown) =>
  ({
    invoke: (messages: unknown, options?: unknown) => Promise.resolve(handler(messages, options)),
    bindTools: () => ({
      invoke: (messages: unknown, options?: unknown) => Promise.resolve(handler(messages, options)),
    }),
  }) as unknown as BaseChatModel;

describe("Adapter LangChain model", () => {
  it("maps tool choice required to any and passes invoke options", async () => {
    let captured: { options?: unknown } | undefined;
    const model = createModel((messages, options) => {
      captured = { options };
      return new AIMessage("ok");
    });

    const adapter = fromLangChainModel(model);
    await adapter.generate({
      prompt: "hi",
      tools: [Tool.create({ name: "search" })],
      toolChoice: "required",
    });

    expect(captured?.options).toMatchObject({ tool_choice: "any" });
  });

  it("prepends system messages when building prompts", async () => {
    let captured: { messages?: unknown } | undefined;
    const model = createModel((messages) => {
      captured = { messages };
      return new AIMessage("ok");
    });

    const adapter = fromLangChainModel(model);
    await adapter.generate({ prompt: "hi", system: "sys" });

    const items = Array.isArray(captured?.messages) ? captured?.messages : [];
    expect(items[0]?.type).toBe("system");
  });

  it("emits response schema parse failure diagnostics", async () => {
    const response = new AIMessage("not json");
    const model = createModel(() => response);
    const adapter = fromLangChainModel(model);

    const result = await adapter.generate({
      prompt: "hi",
      responseSchema: toAdapterSchema({ type: "object", properties: {} }),
    });

    expect(result.diagnostics?.map((entry) => entry.message)).toContain(
      "response_schema_parse_failed",
    );
  });

  it("maps tool results and error statuses", async () => {
    const response = new ToolMessage({
      content: "failed",
      tool_call_id: "call-1",
      name: "search",
      status: "error",
    });
    const model = createModel(() => response);
    const adapter = fromLangChainModel(model);

    const result = await adapter.generate({ prompt: "hi" });
    expect(result.toolResults?.[0]?.isError).toBe(true);
  });

  it("treats missing usage metadata as unavailable", async () => {
    const response = new AIMessage("ok") as AIMessage & {
      usage_metadata?: Record<string, unknown>;
    };
    response.usage_metadata = undefined;
    const model = createModel(() => response);
    const adapter = fromLangChainModel(model);

    const result = await adapter.generate({ prompt: "hi" });
    expect(result.usage).toBeUndefined();
  });

  it("maps usage metadata when present", async () => {
    const response = new AIMessage("ok") as AIMessage & {
      usage_metadata?: Record<string, unknown>;
    };
    response.usage_metadata = { input_tokens: 1, output_tokens: 2, total_tokens: 3 };
    const model = createModel(() => response);
    const adapter = fromLangChainModel(model);

    const result = await adapter.generate({ prompt: "hi" });
    expect(result.usage).toEqual({ inputTokens: 1, outputTokens: 2, totalTokens: 3 });
  });
});
