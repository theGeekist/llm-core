import { describe, expect, it } from "bun:test";
import { Tool, adapterParamTypeToJsonType, adapterParamsToJsonSchema } from "#adapters";

describe("Adapter tool helpers", () => {
  it("creates tool params with metadata", () => {
    const param = Tool.param("query", "string", { description: "q", required: true });
    expect(param).toEqual({
      name: "query",
      type: "string",
      description: "q",
      required: true,
    });
  });

  it("creates tools from value-first inputs", () => {
    const tool = Tool.create({ name: "search", description: "Search tool" });
    expect(tool.name).toBe("search");
    expect(tool.description).toBe("Search tool");
  });

  it("maps adapter params into JSON schema", () => {
    const schema = adapterParamsToJsonSchema([
      { name: "query", type: "string", required: true },
      { name: "limit", type: "number" },
    ]);

    expect(schema.properties).toMatchObject({
      query: { type: "string" },
      limit: { type: "number" },
    });
    expect(schema.required).toEqual(["query"]);
    expect(schema.additionalProperties).toBe(false);
  });

  it("falls back to string for unknown param types", () => {
    expect(adapterParamTypeToJsonType("custom")).toBe("string");
  });
});
