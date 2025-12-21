import { describe, expect, it } from "bun:test";
import { tool as langchainTool } from "@langchain/core/tools";
import { z } from "zod";
import type { BaseTool } from "@llamaindex/core/llms";
import { jsonSchema, type Tool } from "ai";
import type { AdapterTool } from "#workflow";

const toAdapterToolFromLangChain = (lcTool: {
  name: string;
  description?: string;
}): AdapterTool => ({
  name: lcTool.name,
  description: lcTool.description,
});

const toAdapterToolFromLlama = (llamaTool: BaseTool): AdapterTool => ({
  name: llamaTool.metadata.name,
  description: llamaTool.metadata.description,
});

const toAdapterToolFromAiSdk = (sdkTool: Tool): AdapterTool => ({
  name: "ai.tool",
  description: sdkTool.description,
  inputSchema: { jsonSchema: sdkTool.inputSchema },
});

describe("Interop tools", () => {
  const TOOL_NAME = "search";
  const TOOL_DESCRIPTION = "search tool";

  it("maps LangChain tools to AdapterTool", () => {
    const lcTool = langchainTool((input: { query: string }) => `result:${input.query}`, {
      name: TOOL_NAME,
      description: TOOL_DESCRIPTION,
      schema: z.object({ query: z.string() }),
    });

    const adapted = toAdapterToolFromLangChain(lcTool);
    expect(adapted).toEqual({ name: TOOL_NAME, description: TOOL_DESCRIPTION });
  });

  it("maps LlamaIndex tools to AdapterTool", () => {
    const llamaTool: BaseTool = {
      metadata: {
        name: TOOL_NAME,
        description: TOOL_DESCRIPTION,
        parameters: {},
      },
      call: () => "ok",
    };

    const adapted = toAdapterToolFromLlama(llamaTool);
    expect(adapted).toEqual({ name: TOOL_NAME, description: TOOL_DESCRIPTION });
  });

  it("maps AI SDK tools to AdapterTool", () => {
    const sdkTool: Tool = {
      description: TOOL_DESCRIPTION,
      inputSchema: jsonSchema({
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      }),
    };

    const adapted = toAdapterToolFromAiSdk(sdkTool);
    expect(adapted.description).toBe(TOOL_DESCRIPTION);
  });
});
