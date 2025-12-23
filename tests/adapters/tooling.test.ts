import { describe, expect, it } from "bun:test";
import { Tooling, adapterParamTypeToJsonType, adapterParamsToJsonSchema } from "#adapters";
import { captureDiagnostics } from "./helpers";

describe("Adapter tool helpers", () => {
  it("creates tool params with metadata", () => {
    const param = Tooling.param("query", "string", { description: "q", required: true });
    expect(param).toEqual({
      name: "query",
      type: "string",
      description: "q",
      required: true,
    });
  });

  it("creates tools from value-first inputs", () => {
    const tool = Tooling.create({ name: "search", description: "Search tool" });
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

  it("validates tool input before executing", async () => {
    const { context, diagnostics } = captureDiagnostics();
    const tool = Tooling.create({
      name: "echo",
      params: [{ name: "value", type: "string", required: true }],
      execute: (input) => input,
    });

    const missing = await tool.execute?.(undefined, context);
    const value = await tool.execute?.({ value: "ok" }, context);

    expect(missing).toBeUndefined();
    expect(value).toEqual({ value: "ok" });
    expect(diagnostics[0]?.message).toBe("tool_input_missing");
  });
});
