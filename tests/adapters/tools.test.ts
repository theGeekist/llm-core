import { describe, expect, it } from "bun:test";
import { jsonSchema, type Tool } from "ai";
import { tool as langchainTool } from "@langchain/core/tools";
import { z } from "zod";
import type { BaseTool } from "@llamaindex/core/llms";
import { fromAiSdkTool, fromLangChainTool, fromLlamaIndexTool } from "#adapters";

describe("Adapter tools", () => {
  it("maps LangChain tool metadata and execution", async () => {
    const lcTool = langchainTool((input: { query: string }) => `ok:${input.query}`, {
      name: "search",
      description: "search tool",
      schema: z.object({ query: z.string() }),
    });

    const adapter = fromLangChainTool(lcTool);
    expect(adapter.name).toBe("search");
    expect(adapter.description).toBe("search tool");
    expect(adapter.inputSchema?.kind).toBe("zod");
    const result = await adapter.execute?.({ query: "hi" });
    expect(result).toBe("ok:hi");
  });

  it("maps LlamaIndex tool metadata and execution", async () => {
    const llamaTool: BaseTool = {
      metadata: {
        name: "lookup",
        description: "lookup tool",
        parameters: { type: "object", properties: { query: { type: "string" } } },
      },
      call: (input: { query: string }) => `ok:${input.query}`,
    };

    const adapter = fromLlamaIndexTool(llamaTool);
    expect(adapter.name).toBe("lookup");
    expect(adapter.description).toBe("lookup tool");
    expect(adapter.inputSchema?.kind).toBe("json-schema");
    const result = await adapter.execute?.({ query: "hi" });
    expect(result).toBe("ok:hi");
  });

  it("maps AI SDK tool metadata", () => {
    const sdkTool: Tool = {
      description: "ai tool",
      inputSchema: jsonSchema({
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      }),
      execute: ({ query }: { query: string }) => `ok:${query}`,
    };

    const adapter = fromAiSdkTool("ai.tool", sdkTool);
    expect(adapter.name).toBe("ai.tool");
    expect(adapter.description).toBe("ai tool");
    expect(adapter.inputSchema?.kind).toBe("json-schema");
  });
});
