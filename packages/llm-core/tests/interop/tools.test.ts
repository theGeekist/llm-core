import { describe, expect, it } from "bun:test";
import { tool as langchainTool } from "@langchain/core/tools";
import { z } from "zod";
import type { BaseTool } from "@llamaindex/core/llms";
import { jsonSchema, type Tool as AiTool } from "ai";
import type { Tool } from "#adapters";

const toToolFromLangChain = (lcTool: { name: string; description?: string }): Tool => ({
  name: lcTool.name,
  description: lcTool.description,
});

const toToolFromLlama = (llamaTool: BaseTool): Tool => ({
  name: llamaTool.metadata.name,
  description: llamaTool.metadata.description,
});

const toToolFromAiSdk = (sdkTool: AiTool): Tool => ({
  name: "ai.tool",
  description: sdkTool.description,
  inputSchema: { jsonSchema: sdkTool.inputSchema },
});

describe("Interop tools", () => {
  const TOOL_NAME = "search";
  const TOOL_DESCRIPTION = "search tool";

  it("maps LangChain tools to Tool", () => {
    const lcTool = langchainTool((input: { query: string }) => `result:${input.query}`, {
      name: TOOL_NAME,
      description: TOOL_DESCRIPTION,
      schema: z.object({ query: z.string() }),
    });

    const adapted = toToolFromLangChain(lcTool);
    expect(adapted).toEqual({ name: TOOL_NAME, description: TOOL_DESCRIPTION });
  });

  it("maps LlamaIndex tools to Tool", () => {
    const llamaTool: BaseTool = {
      metadata: {
        name: TOOL_NAME,
        description: TOOL_DESCRIPTION,
        parameters: {},
      },
      call: () => "ok",
    };

    const adapted = toToolFromLlama(llamaTool);
    expect(adapted).toEqual({ name: TOOL_NAME, description: TOOL_DESCRIPTION });
  });

  it("maps AI SDK tools to Tool", () => {
    const sdkTool: AiTool = {
      description: TOOL_DESCRIPTION,
      inputSchema: jsonSchema({
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      }),
    };

    const adapted = toToolFromAiSdk(sdkTool);
    expect(adapted.description).toBe(TOOL_DESCRIPTION);
  });
});
