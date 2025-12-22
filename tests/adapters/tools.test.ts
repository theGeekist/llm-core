import { describe, expect, it } from "bun:test";
import { jsonSchema, type Tool } from "ai";
import { tool as langchainTool } from "@langchain/core/tools";
import { z } from "zod";
import type { BaseTool } from "@llamaindex/core/llms";
import {
  Tool as AdapterToolHelper,
  fromAiSdkTool,
  fromLangChainTool,
  fromLlamaIndexTool,
} from "#adapters";
import { toAiSdkTool, toAiSdkTools } from "../../src/adapters/ai-sdk/tools";
import { toLangChainTool } from "../../src/adapters/langchain/tools";
import { toLlamaIndexTool } from "../../src/adapters/llamaindex/tools";
import { makeSchema } from "./helpers";

describe("Adapter tools", () => {
  const TOOL_NAME = "search";
  const JSON_SCHEMA_KIND = "json-schema";
  const TOOL_LOOKUP = "lookup";
  it("maps LangChain tool metadata and execution", async () => {
    const lcTool = langchainTool((input: { query: string }) => `ok:${input.query}`, {
      name: TOOL_NAME,
      description: `${TOOL_NAME} tool`,
      schema: z.object({ query: z.string() }),
    });

    const adapter = fromLangChainTool(lcTool);
    expect(adapter.name).toBe(TOOL_NAME);
    expect(adapter.description).toBe(`${TOOL_NAME} tool`);
    expect(adapter.inputSchema?.kind).toBe("zod");
    const result = await adapter.execute?.({ query: "hi" });
    expect(result).toBe("ok:hi");
  });

  it("maps LlamaIndex tool metadata and execution", async () => {
    const llamaTool: BaseTool = {
      metadata: {
        name: TOOL_LOOKUP,
        description: `${TOOL_LOOKUP} tool`,
        parameters: { type: "object", properties: { query: { type: "string" } } },
      },
      call: (input: { query: string }) => `ok:${input.query}`,
    };

    const adapter = fromLlamaIndexTool(llamaTool);
    expect(adapter.name).toBe(TOOL_LOOKUP);
    expect(adapter.description).toBe(`${TOOL_LOOKUP} tool`);
    expect(adapter.inputSchema?.kind).toBe(JSON_SCHEMA_KIND);
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
    expect(adapter.inputSchema?.kind).toBe("unknown");
  });

  it("reads AI SDK tool schema from parameters when inputSchema is missing", () => {
    const sdkTool = {
      description: "ai tool",
      parameters: jsonSchema({
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      }),
      execute: ({ query }: { query: string }) => `ok:${query}`,
    } as unknown as Tool;

    const adapter = fromAiSdkTool("ai.tool", sdkTool);
    expect(adapter.inputSchema?.kind).toBe("unknown");
  });

  it("builds AI SDK tool definitions from adapter tools", () => {
    const schema = makeSchema(
      z.object({
        query: z.string(),
      }),
      "zod",
    );
    const adapterTool = AdapterToolHelper.create({
      name: TOOL_NAME,
      description: `${TOOL_NAME} tool`,
      inputSchema: schema,
    });

    const built = toAiSdkTool(adapterTool);
    expect(built.description).toBe(`${TOOL_NAME} tool`);
    expect(built.inputSchema).toBeDefined();
  });

  it("returns undefined when no AI SDK tools are provided", () => {
    expect(toAiSdkTools([])).toBeUndefined();
  });

  it("preserves zod schemas when building LangChain tools", () => {
    const schema = makeSchema(
      z.object({
        query: z.string(),
      }),
      "zod",
    );
    const adapterTool = AdapterToolHelper.create({
      name: TOOL_NAME,
      description: `${TOOL_NAME} tool`,
      inputSchema: schema,
    });

    const built = toLangChainTool(adapterTool);
    expect(built.schema as unknown).toBe(schema.jsonSchema);
  });

  it("builds LangChain tools from params when schemas are missing", async () => {
    const adapterTool = AdapterToolHelper.create({
      name: TOOL_NAME,
      params: [{ name: "query", type: "string", required: true }],
      execute: (input) => input,
    });

    const built = toLangChainTool(adapterTool);
    expect(built.schema).toBeDefined();
    expect(built.name).toBe(TOOL_NAME);
    const func = (built as { func?: (input: unknown) => Promise<unknown> }).func;
    expect(func).toBeDefined();
    const invoked = await func?.({ query: "hi" });
    expect(invoked).toEqual({ query: "hi" });
  });

  it("uses identity execution when adapter tool has no execute", async () => {
    const adapterTool = AdapterToolHelper.create({
      name: TOOL_NAME,
      params: [{ name: "query", type: "string" }],
    });

    const built = toLangChainTool(adapterTool);
    const func = (built as { func?: (input: unknown) => Promise<unknown> }).func;
    expect(func).toBeDefined();
    const invoked = await func?.({ query: "hi" });
    expect(invoked).toEqual({ query: "hi" });
  });

  it("builds LlamaIndex tools from adapter tools", async () => {
    const adapterTool = AdapterToolHelper.create({
      name: TOOL_NAME,
      description: `${TOOL_NAME} tool`,
      params: [{ name: "query", type: "string" }],
      execute: (input) => input,
    });

    const built = toLlamaIndexTool(adapterTool);
    const result = await built.call?.({ query: "hi" });
    expect(result).toEqual({ query: "hi" });
  });

  it("falls back to identity execution for LlamaIndex tools", async () => {
    const adapterTool = AdapterToolHelper.create({
      name: TOOL_NAME,
      params: [{ name: "query", type: "string" }],
    });

    const built = toLlamaIndexTool(adapterTool);
    const result = await built.call?.({ query: "hi" });
    expect(result).toEqual({ query: "hi" });
  });
});
